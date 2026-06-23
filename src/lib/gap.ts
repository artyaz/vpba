import type { QuizItem, WordRow } from './types';

/** Marker placed where the answer is removed. The UI renders an input here. */
export const GAP = '{{gap}}';

/** Split the DB `sentence` field into individual sentences.
 * Handles the "1. ... \n2. ... \n3. ..." numbered format your rows use,
 * and falls back to line / whole-field splitting for anything else. */
export function splitSentences(field: string): string[] {
	const text = field.replace(/\r/g, '').trim();
	if (!text) return [];

	const markerRe = /(?:^|\n)\s*\d+[.)]\s+/g;
	const markers = [...text.matchAll(markerRe)];
	if (markers.length) {
		const out: string[] = [];
		for (let i = 0; i < markers.length; i++) {
			const start = markers[i].index + markers[i][0].length;
			const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
			const seg = text.slice(start, end).trim();
			if (seg) out.push(seg);
		}
		if (out.length) return out;
	}

	const lines = text
		.split(/\n+/)
		.map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
		.filter(Boolean);
	return lines.length ? lines : [text];
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Hit {
	index: number;
	length: number;
	text: string;
}

/** Find where the headword (or phrase, or a close inflection) sits in a sentence. */
export function locate(sentence: string, word: string): Hit | null {
	const head = word.trim();
	if (!head) return null;

	const tokens = head.split(/[\s-]+/).filter(Boolean);
	const isPhrase = tokens.length > 1;

	// 1. Exact match (phrase-aware: "pan out" also matches "pan-out").
	const body = isPhrase ? tokens.map(escapeRe).join('[-\\s]+') : escapeRe(head);
	const exact = new RegExp(`(?<![\\p{L}])${body}(?![\\p{L}])`, 'iu');
	const m = exact.exec(sentence);
	if (m) return { index: m.index, length: m[0].length, text: m[0] };

	// 2. Inflection fallback for single words: same stem, similar length.
	if (!isPhrase) {
		const stem = head.slice(0, Math.max(3, head.length - 3));
		const re = new RegExp(`(?<![\\p{L}])(${escapeRe(stem)}\\p{L}*)`, 'giu');
		let best: Hit | null = null;
		let hit: RegExpExecArray | null;
		while ((hit = re.exec(sentence))) {
			const cand = hit[1];
			if (Math.abs(cand.length - head.length) <= 4) {
				best = { index: hit.index, length: cand.length, text: cand };
				break;
			}
		}
		if (best) return best;
	}

	return null;
}

/** Turn one DB row into playable gap-fill items (one per usable sentence). */
export function makeQuizItems(row: WordRow): QuizItem[] {
	const head = row.word.trim();
	const items: QuizItem[] = [];
	for (const s of splitSentences(row.sentence)) {
		const loc = locate(s, head);
		if (!loc) continue;
		const masked = s.slice(0, loc.index) + GAP + s.slice(loc.index + loc.length);
		items.push({
			id: row.id,
			word: head,
			answer: loc.text,
			headword: head,
			masked,
			definition: row.definition,
			recollection: row.recollection
		});
	}
	return items;
}

/** Normalise an answer for forgiving comparison (case, punctuation, hyphen vs space). */
export function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/[-\s]+/g, ' ')
		.trim();
}

export function checkAnswer(input: string, item: QuizItem): boolean {
	const a = normalize(input);
	if (!a) return false;
	return a === normalize(item.answer) || a === normalize(item.headword);
}
