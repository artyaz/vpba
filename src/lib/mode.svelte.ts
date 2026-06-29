import { browser } from '$app/environment';

export type ModeId = 'gap' | 'gapselect' | 'choice' | 'recall' | 'synonym' | 'compose' | 'showdown';

export const MODES: { id: ModeId; label: string; blurb: string }[] = [
	{ id: 'gap', label: 'fill the gap', blurb: 'type the missing word in a sentence' },
	{ id: 'gapselect', label: 'fill the gap (choose)', blurb: 'pick the missing word from options' },
	{ id: 'choice', label: 'pick the meaning', blurb: 'choose the right definition' },
	{ id: 'recall', label: 'name the word', blurb: 'read the meaning, recall the word' },
	{ id: 'synonym', label: 'pick the synonym', blurb: 'choose a word that means the same' },
	{ id: 'compose', label: 'write a sentence', blurb: 'use the word, the AI grades you' },
	{ id: 'showdown', label: 'showdown', blurb: '3 words, a rapid mixed-drill gauntlet' }
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
