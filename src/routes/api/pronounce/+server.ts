import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Azure Speech pronunciation assessment over the short-audio REST endpoint.
 * The user's key/region arrive with the request (BYO) — proxied for CORS,
 * never stored or logged. Receives a 16 kHz mono WAV + reference text. */
/** Azure puts scores either nested under `PronunciationAssessment` or directly
 * on the word/phoneme object, depending on the response. Read both. */
function num(...vals: unknown[]): number | null {
	for (const v of vals) if (typeof v === 'number') return v;
	return null;
}

export const POST: RequestHandler = async ({ request, url }) => {
	const debug = url.searchParams.get('debug') === '1';
	const form = await request.formData().catch(() => null);
	const key = String(form?.get('key') ?? '').trim();
	const region = String(form?.get('region') ?? 'eastus').trim() || 'eastus';
	const ref = String(form?.get('text') ?? '').trim();
	const audio = form?.get('audio');
	if (!key) {
		return json({ error: 'No Azure key — add one in Settings.' }, { status: 400 });
	}
	if (!ref || !(audio instanceof Blob)) {
		return json({ error: 'Missing audio or reference text.' }, { status: 400 });
	}

	const params = {
		ReferenceText: ref,
		GradingSystem: 'HundredMark',
		Granularity: 'Phoneme',
		Dimension: 'Comprehensive',
		EnableMiscue: 'False',
		EnableProsodyAssessment: 'True',
		PhonemeAlphabet: 'SAPI',
		NBestPhonemeCount: 5
	};
	const paHeader = btoa(unescape(encodeURIComponent(JSON.stringify(params))));

	const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
	const body = await audio.arrayBuffer();

	let res: Response;
	try {
		res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': key,
				'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
				'Pronunciation-Assessment': paHeader,
				Accept: 'application/json'
			},
			body
		});
	} catch (e) {
		return json({ error: `Could not reach Azure: ${(e as Error).message}` }, { status: 502 });
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		return json({ error: `Azure error ${res.status}. ${detail.slice(0, 300)}` }, { status: 502 });
	}

	const data = await res.json().catch(() => null);
	const nb = data?.NBest?.[0];
	if (!nb) {
		const status = data?.RecognitionStatus;
		const msg =
			status && status !== 'Success'
				? `No speech recognized (${status}). Speak a little louder and closer to the mic.`
				: "Didn't catch any speech — try again, a little louder and closer.";
		return json({ error: msg }, { status: 200 });
	}

	/* eslint-disable @typescript-eslint/no-explicit-any */
	const pa = nb.PronunciationAssessment ?? {};
	const words = ((nb.Words ?? []) as any[]).map((w) => {
		const wpa = w.PronunciationAssessment ?? {};
		return {
			word: w.Word,
			accuracy: num(wpa.AccuracyScore, w.AccuracyScore),
			errorType: wpa.ErrorType ?? w.ErrorType ?? 'None',
			phonemes: ((w.Phonemes ?? []) as any[]).map((p) => {
				const ppa = p.PronunciationAssessment ?? {};
				const nbest = (ppa.NBestPhonemes ?? p.NBestPhonemes ?? []) as any[];
				return {
					phoneme: p.Phoneme,
					accuracy: num(ppa.AccuracyScore, p.AccuracyScore),
					nbest: nbest.map((n) => ({ phoneme: n.Phoneme, score: n.Score }))
				};
			})
		};
	});

	return json({
		recognized: nb.Display ?? nb.Lexical ?? '',
		accuracy: num(pa.AccuracyScore, nb.AccuracyScore),
		fluency: num(pa.FluencyScore, nb.FluencyScore),
		completeness: num(pa.CompletenessScore, nb.CompletenessScore),
		prosody: num(pa.ProsodyScore, nb.ProsodyScore),
		pron: num(pa.PronScore, nb.PronScore),
		words,
		...(debug ? { _raw: data } : {})
	});
};
