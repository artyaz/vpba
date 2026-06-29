import { browser } from '$app/environment';
import type { AiConfig } from './types';

export interface Settings {
	/** Neon connection string — used browser-direct, never sent to our server. */
	dbUrl: string;
	/** The active deck — name of the table currently being practised. */
	dbTable: string;
	/** All saved decks (table names) you can switch between, e.g. per language. */
	decks: string[];
	/** Azure Speech — proxied (CORS), never stored server-side. */
	azureKey: string;
	azureRegion: string;
	/** OpenAI-compatible generation endpoint. */
	ai: AiConfig;
	/** How many rounds a Showdown run lasts. */
	showdownRounds: number;
}

const KEY = 'gapfill.settings';

const empty: Settings = {
	dbUrl: '',
	dbTable: 'words',
	decks: ['words'],
	azureKey: '',
	azureRegion: 'eastus',
	ai: { baseUrl: '', apiKey: '', model: '' },
	showdownRounds: 10
};

function cleanName(name: string): string {
	return name.trim().replace(/[^a-zA-Z0-9_]/g, '');
}

/** Make sure decks is a clean list that always contains the active deck. */
function normalizeDecks(s: Settings): void {
	const active = cleanName(s.dbTable) || 'words';
	const seen = new Set<string>();
	const decks: string[] = [];
	for (const d of [active, ...(s.decks || [])]) {
		const c = cleanName(d);
		if (c && !seen.has(c)) {
			seen.add(c);
			decks.push(c);
		}
	}
	s.dbTable = active;
	s.decks = decks.length ? decks : ['words'];
}

function load(): Settings {
	if (!browser) return structuredClone(empty);
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
		const merged: Settings = { ...empty, ...raw, ai: { ...empty.ai, ...(raw.ai || {}) } };
		normalizeDecks(merged);
		return merged;
	} catch {
		return structuredClone(empty);
	}
}

/** Reactive, localStorage-backed settings. Bind to fields, then call save(). */
export const settings = $state<Settings>(load());

export function save() {
	settings.dbUrl = settings.dbUrl.trim();
	settings.dbTable = settings.dbTable.trim() || 'words';
	normalizeDecks(settings);
	settings.azureKey = settings.azureKey.trim();
	settings.azureRegion = settings.azureRegion.trim() || 'eastus';
	settings.ai.baseUrl = settings.ai.baseUrl.trim().replace(/\/+$/, '');
	settings.ai.apiKey = settings.ai.apiKey.trim();
	settings.ai.model = settings.ai.model.trim();
	settings.showdownRounds = Math.min(30, Math.max(3, Math.round(settings.showdownRounds) || 10));
	if (browser) localStorage.setItem(KEY, JSON.stringify(settings));
}

/** Switch the active deck (the table the trainer pulls words from). */
export function setActiveDeck(name: string) {
	const c = cleanName(name);
	if (!c) return;
	settings.dbTable = c;
	if (!settings.decks.includes(c)) settings.decks.push(c);
	save();
}

/** Add a new deck (does not switch to it). Returns the cleaned name, or '' if invalid. */
export function addDeck(name: string): string {
	const c = cleanName(name);
	if (!c) return '';
	if (!settings.decks.includes(c)) settings.decks.push(c);
	save();
	return c;
}

/** Remove a deck. Won't remove the last one; if it's active, switches to another. */
export function removeDeck(name: string) {
	const c = cleanName(name);
	if (settings.decks.length <= 1) return;
	settings.decks = settings.decks.filter((d) => d !== c);
	if (settings.dbTable === c) settings.dbTable = settings.decks[0];
	save();
}

export const dbReady = () => Boolean(settings.dbUrl);
export const azureReady = () => Boolean(settings.azureKey);
export const aiReady = () => Boolean(settings.ai.baseUrl && settings.ai.apiKey && settings.ai.model);

/** A portable, copy-pasteable blob of the whole config (keys included). */
export function exportConfig(): string {
	const json = JSON.stringify({ ...settings, ai: { ...settings.ai } });
	const b64 = btoa(unescape(encodeURIComponent(json)));
	return `gapfill:${b64}`;
}

/** Load a config string produced by exportConfig(). Returns true on success. */
export function importConfig(text: string): boolean {
	try {
		const raw = text.trim().replace(/^gapfill:/, '');
		const json = decodeURIComponent(escape(atob(raw)));
		const next = JSON.parse(json);
		settings.dbUrl = String(next.dbUrl ?? '');
		settings.dbTable = String(next.dbTable ?? 'words') || 'words';
		settings.decks = Array.isArray(next.decks) ? next.decks.map((d: unknown) => String(d)) : [];
		settings.azureKey = String(next.azureKey ?? '');
		settings.azureRegion = String(next.azureRegion ?? 'eastus') || 'eastus';
		settings.ai = {
			baseUrl: String(next.ai?.baseUrl ?? ''),
			apiKey: String(next.ai?.apiKey ?? ''),
			model: String(next.ai?.model ?? '')
		};
		settings.showdownRounds = Number(next.showdownRounds) || 10;
		save();
		return true;
	} catch {
		return false;
	}
}
