export interface WordRow {
	id: number;
	word: string;
	definition: string;
	sentence: string;
	recollection: number;
	created_at: string;
}

/** A single playable gap-fill item derived from one sentence of a word. */
export interface QuizItem {
	id: number;
	word: string;
	/** the exact answer expected (the form as it appears in the sentence) */
	answer: string;
	/** the dictionary headword, always accepted as an answer too */
	headword: string;
	/** sentence with the answer replaced by a blank marker */
	masked: string;
	definition: string;
	recollection: number;
}

/** OpenAI-compatible endpoint config, stored client-side in localStorage. */
export interface AiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export interface GeneratedWord {
	word: string;
	definition: string;
	sentences: string[];
}

export interface PhonemeScore {
	phoneme: string;
	accuracy: number | null;
	/** Top alternatives Azure actually heard, best-first (for suggestions). */
	nbest?: { phoneme: string; score: number }[];
}

export interface PronounceWord {
	word: string;
	accuracy: number | null;
	errorType: string;
	phonemes: PhonemeScore[];
}

export interface PronounceResult {
	recognized: string;
	accuracy: number | null;
	fluency: number | null;
	completeness: number | null;
	prosody: number | null;
	pron: number | null;
	words: PronounceWord[];
}
