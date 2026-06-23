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
