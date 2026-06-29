import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chat } from '$lib/server/chat';
import type { GeneratedWord } from '$lib/types';

const SYSTEM = `You are a sharp, witty English lexicographer — think the writers' room of a smart late-night show, not a dull textbook.
Given a target word or phrase, produce:
- "definition": a short, clear explanation in simple English (CEFR B1-B2). Mention any common figurative/idiomatic sense. Then a line "Ukrainian:" with 2-3 Ukrainian translations.
- "sentences": EXACTLY 3 example sentences that are genuinely interesting, vivid and memorable — clever, a little funny, real-world. Never generic ("The man used the word."). The 3rd sentence MUST use the word figuratively or idiomatically. Every sentence MUST contain the exact target word/phrase.
Return ONLY minified JSON: {"word": string, "definition": string, "sentences": [string, string, string]}. No markdown, no commentary.`;

function extractJson(text: string): GeneratedWord | null {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1) return null;
	try {
		const obj = JSON.parse(text.slice(start, end + 1));
		if (!obj.word || !Array.isArray(obj.sentences)) return null;
		return {
			word: String(obj.word).trim(),
			definition: String(obj.definition || '').trim(),
			sentences: obj.sentences.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 3)
		};
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const { config, word } = await request.json().catch(() => ({}));
	const w = String(word || '').trim();
	if (!config?.baseUrl || !config?.apiKey || !config?.model) {
		return json({ error: 'AI endpoint is not configured. Open Settings.' }, { status: 400 });
	}
	if (!w) return json({ error: 'No word provided.' }, { status: 400 });

	let res;
	try {
		// cap output + force JSON so the model stops early and we don't retry on stray prose
		res = await chat(
			fetch,
			config,
			[
				{ role: 'system', content: SYSTEM },
				{ role: 'user', content: `Target: ${w}` }
			],
			{ temperature: 0.8, maxTokens: 600, json: true }
		);
	} catch (e) {
		return json({ error: `Could not reach the AI endpoint: ${(e as Error).message}` }, { status: 502 });
	}

	if (!res.ok) {
		return json({ error: `AI endpoint error (${res.status}). ${res.detail.slice(0, 300)}` }, { status: 502 });
	}

	const parsed = extractJson(res.content);
	if (!parsed || parsed.sentences.length === 0) {
		return json({ error: 'The model did not return usable JSON. Try a more capable model.' }, { status: 502 });
	}
	parsed.word ||= w;
	return json({ generated: parsed });
};
