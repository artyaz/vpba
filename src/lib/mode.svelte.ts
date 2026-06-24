import { browser } from '$app/environment';

export type ModeId = 'gap' | 'choice' | 'recall' | 'compose';

export const MODES: { id: ModeId; label: string; blurb: string }[] = [
	{ id: 'gap', label: 'fill the gap', blurb: 'type the missing word in a sentence' },
	{ id: 'choice', label: 'pick the meaning', blurb: 'choose the right definition' },
	{ id: 'recall', label: 'name the word', blurb: 'read the meaning, recall the word' },
	{ id: 'compose', label: 'write a sentence', blurb: 'use the word, the AI grades you' }
];

const KEY = 'gapfill.mode';

function load(): ModeId {
	if (!browser) return 'gap';
	const v = localStorage.getItem(KEY);
	return MODES.some((m) => m.id === v) ? (v as ModeId) : 'gap';
}

export const modeState = $state<{ id: ModeId }>({ id: load() });

export function setMode(id: ModeId) {
	modeState.id = id;
	if (browser) localStorage.setItem(KEY, id);
}

export function modeLabel(id: ModeId): string {
	return MODES.find((m) => m.id === id)?.label ?? id;
}
