import { browser } from '$app/environment';
import type { AiConfig } from './types';

export interface Settings {
	/** Neon connection string — used browser-direct, never sent to our server. */
	dbUrl: string;
	dbTable: string;
	/** Azure Speech — proxied (CORS), never stored server-side. */
	azureKey: string;
	azureRegion: string;
	/** OpenAI-compatible generation endpoint. */
	ai: AiConfig;
}

const KEY = 'gapfill.settings';

const empty: Settings = {
	dbUrl: '',
	dbTable: 'words',
	azureKey: '',
	azureRegion: 'eastus',
	ai: { baseUrl: '', apiKey: '', model: '' }
};

function load(): Settings {
	if (!browser) return structuredClone(empty);
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
		return { ...empty, ...raw, ai: { ...empty.ai, ...(raw.ai || {}) } };
	} catch {
		return structuredClone(empty);
	}
}

/** Reactive, localStorage-backed settings. Bind to fields, then call save(). */
export const settings = $state<Settings>(load());

export function save() {
	settings.dbUrl = settings.dbUrl.trim();
	settings.dbTable = settings.dbTable.trim() || 'words';
	settings.azureKey = settings.azureKey.trim();
	settings.azureRegion = settings.azureRegion.trim() || 'eastus';
	settings.ai.baseUrl = settings.ai.baseUrl.trim().replace(/\/+$/, '');
	settings.ai.apiKey = settings.ai.apiKey.trim();
	settings.ai.model = settings.ai.model.trim();
	if (browser) localStorage.setItem(KEY, JSON.stringify(settings));
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
		settings.azureKey = String(next.azureKey ?? '');
		settings.azureRegion = String(next.azureRegion ?? 'eastus') || 'eastus';
		settings.ai = {
			baseUrl: String(next.ai?.baseUrl ?? ''),
			apiKey: String(next.ai?.apiKey ?? ''),
			model: String(next.ai?.model ?? '')
		};
		save();
		return true;
	} catch {
		return false;
	}
}
