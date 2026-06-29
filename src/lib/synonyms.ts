// Synonym lookup for the "pick the synonym" mode.
// Primary source is Datamuse (public, CORS-enabled, no key) called browser-direct;
// falls back to the user's AI endpoint when Datamuse comes up empty.
import { normalize } from './gap';
import type { AiConfig, WordRow } from './types';

/** A few everyday words used to pad out distractors when the deck is small. */
const FILLER = [
	'happy', 'quiet', 'rapid', 'simple', 'narrow', 'gentle', 'bright', 'heavy',
	'rough', 'clever', 'plain', 'sudden', 'distant', 'silent', 'eager', 'sturdy'
];

function uniqueWords(list: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const w of list) {
		const t = w.trim();
		const k = normalize(t);
		if (!t || !k || seen.has(k)) continue;
		seen.add(k);
		out.push(t);
	}
	return out;
}

/** Synonyms for a word from Datamuse (rel_syn, then means-like as a wider net). */
export async function fetchSynonyms(word: string): Promise<string[]> {
	const w = word.trim();
	if (!w) return [];
	const grab = async (q: string) => {
		try {
			const res = await fetch(`https://api.datamuse.com/words?${q}=${encodeURIComponent(w)}&max=20`);
			const data = (await res.json()) as Array<{ word: string }>;
			return data.map((d) => d.word);
		} catch {
			return [];
		}
	};
	let syns = await grab('rel_syn');
	if (syns.length < 2) syns = uniqueWords([...syns, ...(await grab('ml'))]);
	// drop multi-word and forms that just repeat the headword
	const head = normalize(w);
	return uniqueWords(syns).filter((s) => !s.includes(' ') && normalize(s) !== head);
}

/** AI fallback — ask the configured endpoint for synonyms. Returns [] on any failure. */
export async function fetchSynonymsAi(config: AiConfig, word: string): Promise<string[]> {
	if (!config.baseUrl || !config.apiKey || !config.model) return [];
	try {
		const res = await fetch('/api/synonyms', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ config, word })
		});
		const body = await res.json();
		return Array.isArray(body.synonyms) ? uniqueWords(body.synonyms) : [];
	} catch {
		return [];
	}
}

export interface SynonymOption {
	text: string;
	correct: boolean;
}

/** Build the multiple-choice question: one real synonym + plausible non-synonyms. */
export function buildSynonymOptions(
	synonyms: string[],
	row: WordRow,
	all: WordRow[],
	max = 4
): SynonymOption[] {
	const synSet = new Set(synonyms.map(normalize));
	const correct = synonyms[Math.floor(Math.random() * synonyms.length)];

	const pool = uniqueWords([
		...all.filter((w) => w.id !== row.id).map((w) => w.word),
		...FILLER
	]).filter((w) => {
		const k = normalize(w);
		return k !== normalize(row.word) && !synSet.has(k);
	});

	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}

	const options: SynonymOption[] = [
		{ text: correct, correct: true },
		...pool.slice(0, max - 1).map((text) => ({ text, correct: false }))
	];
	for (let i = options.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[options[i], options[j]] = [options[j], options[i]];
	}
	return options;
}
