import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chat } from '$lib/server/chat';

const SYSTEM = `You give synonyms for an English word or phrase.
Return ONLY minified JSON: {"synonyms": [string, ...]} with 4-8 single-word synonyms that mean the same thing, common and natural, no multi-word phrases, no the target word itself. No markdown, no commentary.`;

function extract(text: string): string[] | null {
	const a = text.indexOf('{');
	const b = text.lastIndexOf('}');
	if (a === -1 || b === -1) return null;
	try {
		const o = JSON.parse(text.slice(a, b + 1));
		if (!Array.isArray(o.synonyms)) return null;
		return o.synonyms.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 8);
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, fetch }) => {
	const { config, word } = await request.json().catch(() => ({}));
	const w = String(word || '').trim();
	if (!config?.baseUrl || !config?.apiKey || !config?.model) {
		return json({ error: 'AI endpoint is not configured.' }, { status: 400 });
	}
	if (!w) return json({ error: 'No word provided.' }, { status: 400 });

	let res;
	try {
		res = await chat(
			fetch,
			config,
			[
				{ role: 'system', content: SYSTEM },
				{ role: 'user', content: `Word: ${w}` }
			],
			{ temperature: 0.3, maxTokens: 120, json: true }
		);
	} catch (e) {
		return json({ error: `Could not reach the AI endpoint: ${(e as Error).message}` }, { status: 502 });
	}

	if (!res.ok) {
		return json({ error: `AI endpoint error (${res.status}). ${res.detail.slice(0, 200)}` }, { status: 502 });
	}

	const synonyms = extract(res.content);
	if (!synonyms) return json({ error: 'No usable synonyms returned.' }, { status: 502 });
	return json({ synonyms });
};
