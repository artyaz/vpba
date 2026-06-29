import { splitSentences } from './gap';
import type { WordRow } from './types';

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A concise, one-line meaning pulled from the (often long, translated) definition. */
export function shortDef(def: string): string {
	let s = def.replace(/\r/g, '').trim();
	const cut = s.search(/\n\n|\bFiguratively\b|\bTranslations?\b|\bUkrainian\b|Translations? to/i);
	if (cut > 15) s = s.slice(0, cut);
	s = s.split('\n')[0].trim();
	const m = s.match(/^.*?[.!?](\s|$)/);
	if (m) s = m[0].trim();
	return s.trim();
}

/** Replace the headword (or phrase / close form) with a blank so it doesn't give itself away. */
export function redact(text: string, word: string, mark = ' ____ '): string {
	const tokens = word.trim().split(/[\s-]+/).filter(Boolean).map(escapeRe).join('[-\\s]+');
	if (!tokens) return text;
	try {
		return text.replace(new RegExp(`(?<![\\p{L}])${tokens}(?![\\p{L}])`, 'giu'), mark);
	} catch {
		return text;
	}
}

/** A representative example sentence for a word (first usable one). */
export function exampleSentence(row: WordRow): string {
	return splitSentences(row.sentence)[0] ?? '';
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export interface ChoiceOption {
	text: string;
	correct: boolean;
}

/** Build multiple-choice options: the right meaning + distractors from other words. */
export function buildChoices(row: WordRow, all: WordRow[], max = 4): ChoiceOption[] {
	const correct = redact(shortDef(row.definition), row.word);
	const others = shuffle(all.filter((w) => w.id !== row.id))
		.map((w) => redact(shortDef(w.definition), w.word))
		.filter((t) => t && t !== correct)
		.slice(0, max - 1);
	return shuffle([{ text: correct, correct: true }, ...others.map((t) => ({ text: t, correct: false }))]);
}

/** Build word options: the right word + other headwords as distractors. */
export function buildWordChoices(correct: string, all: WordRow[], excludeId: number, max = 4): ChoiceOption[] {
	const c = correct.trim();
	const seen = new Set([c.toLowerCase()]);
	const distract: string[] = [];
	for (const w of shuffle(all.filter((x) => x.id !== excludeId))) {
		const t = w.word.trim();
		const k = t.toLowerCase();
		if (!t || seen.has(k)) continue;
		seen.add(k);
		distract.push(t);
		if (distract.length >= max - 1) break;
	}
	return shuffle([{ text: c, correct: true }, ...distract.map((t) => ({ text: t, correct: false }))]);
}
