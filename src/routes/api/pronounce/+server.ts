import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Azure Speech pronunciation assessment over the short-audio REST endpoint.
 * The user's key/region arrive with the request (BYO) — proxied for CORS,
 * never stored or logged. Receives a 16 kHz mono WAV + reference text. */
export const POST: RequestHandler = async ({ request }) => {
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

	const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
	const body = await audio.arrayBuffer();

	let res: Response;
	try {
		res = await fetch(url, {
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

	const pa = nb.PronunciationAssessment ?? {};
	type AzPhoneme = {
		Phoneme: string;
		PronunciationAssessment?: {
			AccuracyScore?: number;
			NBestPhonemes?: Array<{ Phoneme: string; Score: number }>;
		};
	};
	type AzWord = {
		Word: string;
		PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
		Phonemes?: AzPhoneme[];
	};
	const words = ((nb.Words ?? []) as AzWord[]).map((w) => ({
		word: w.Word,
		accuracy: w.PronunciationAssessment?.AccuracyScore ?? null,
		errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
		phonemes: (w.Phonemes ?? []).map((p) => ({
			phoneme: p.Phoneme,
			accuracy: p.PronunciationAssessment?.AccuracyScore ?? null,
			nbest: (p.PronunciationAssessment?.NBestPhonemes ?? []).map((n) => ({
				phoneme: n.Phoneme,
				score: n.Score
			}))
		}))
	}));

	return json({
		recognized: nb.Display ?? nb.Lexical ?? '',
		accuracy: pa.AccuracyScore ?? null,
		fluency: pa.FluencyScore ?? null,
		completeness: pa.CompletenessScore ?? null,
		prosody: pa.ProsodyScore ?? null,
		pron: pa.PronScore ?? null,
		words
	});
};
