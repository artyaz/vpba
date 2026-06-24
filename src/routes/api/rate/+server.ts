import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SYSTEM = `You are a witty, sharp English writing coach — think a smart late-night writers' room, encouraging but honest, never dull.
A learner is practising a target word by writing one sentence with it. Judge how well they used it: is it grammatically correct, natural, and does it show they actually understand the meaning (not just slot it in)? Reward sentences that are vivid, specific or funny; gently mark down flat, generic or incorrect ones.
Return ONLY minified JSON: {"score": 0-100, "verdict": "<2-4 words>", "feedback": "<1-2 sentences, warm and specific>", "better": "<one sharper rewrite of THEIR sentence, or empty string if theirs is already great>"}. No markdown.`;

interface Rating {
	score: number;
	verdict: string;
	feedback: string;
	better: string;
}

function extract(text: string): Rating | null {
	const a = text.indexOf('{');
	const b = text.lastIndexOf('}');
	if (a === -1 || b === -1) return null;
	try {
		const o = JSON.parse(text.slice(a, b + 1));
		if (typeof o.score !== 'number') return null;
		return {
			score: Math.max(0, Math.min(100, Math.round(o.score))),
			verdict: String(o.verdict ?? '').trim(),
			feedback: String(o.feedback ?? '').trim(),
			better: String(o.better ?? '').trim()
		};
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const { config, word, definition, sentence } = await request.json().catch(() => ({}));
	const w = String(word || '').trim();
	const s = String(sentence || '').trim();
	if (!config?.baseUrl || !config?.apiKey || !config?.model) {
		return json({ error: 'AI endpoint is not configured. Open Settings.' }, { status: 400 });
	}
	if (!w || !s) return json({ error: 'Need a word and a sentence.' }, { status: 400 });

	let res: Response;
	try {
		res = await fetch(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
			body: JSON.stringify({
				model: config.model,
				temperature: 0.6,
				messages: [
					{ role: 'system', content: SYSTEM },
					{
						role: 'user',
						content: `Target word: ${w}\nMeaning: ${definition || '(use your own knowledge)'}\nTheir sentence: ${s}`
					}
				]
			})
		});
	} catch (e) {
		return json({ error: `Could not reach the AI endpoint: ${(e as Error).message}` }, { status: 502 });
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		return json({ error: `AI endpoint error (${res.status}). ${detail.slice(0, 300)}` }, { status: 502 });
	}

	const data = await res.json().catch(() => null);
	const rating = extract(data?.choices?.[0]?.message?.content ?? '');
	if (!rating) {
		return json({ error: 'The model did not return a usable score. Try a stronger model.' }, { status: 502 });
	}
	return json({ rating });
};
