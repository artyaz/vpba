<script lang="ts">
	import { settings, save, exportConfig, importConfig, addDeck, removeDeck, setActiveDeck } from '$lib/settings.svelte';
	import { testConnection, createTable } from '$lib/db.client';

	let saved = $state(false);
	let dbBusy = $state(false);
	let dbMsg = $state('');
	let newDeck = $state('');

	function addDeckUI() {
		const name = addDeck(newDeck);
		if (name) {
			setActiveDeck(name);
			newDeck = '';
			dbMsg = `✓ Deck “${name}” added and selected. Hit Create table if it's new.`;
		}
	}
	let aiTesting = $state(false);
	let aiMsg = $state('');

	let copied = $state(false);
	let importText = $state('');
	let importMsg = $state('');

	async function copyConfig() {
		const code = exportConfig();
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			importText = code; // clipboard blocked — drop it in the box so they can copy it
		}
	}

	function doImport() {
		if (!importText.trim()) return;
		const ok = importConfig(importText);
		importMsg = ok ? '✓ Imported — everything is filled in.' : '✗ That code didn’t look right.';
		if (ok) importText = '';
		setTimeout(() => (importMsg = ''), 2500);
	}

	function persist() {
		save();
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}

	async function testDb() {
		save();
		dbBusy = true;
		dbMsg = '';
		const r = await testConnection(settings.dbUrl, settings.dbTable);
		dbMsg = r.ok ? `✓ Connected — ${r.count} word(s) in “${settings.dbTable}”.` : `✗ ${r.error}`;
		dbBusy = false;
	}

	async function initDb() {
		save();
		dbBusy = true;
		dbMsg = '';
		try {
			await createTable(settings.dbUrl, settings.dbTable);
			dbMsg = `✓ Table “${settings.dbTable}” is ready.`;
		} catch (e) {
			dbMsg = `✗ ${(e as Error).message}`;
		}
		dbBusy = false;
	}

	async function testAi() {
		save();
		aiTesting = true;
		aiMsg = '';
		try {
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ config: { ...settings.ai }, word: 'serendipity' })
			});
			const b = await res.json();
			aiMsg = res.ok ? '✓ Working — connection good.' : `✗ ${b.error ?? 'failed'}`;
		} catch (e) {
			aiMsg = `✗ ${(e as Error).message}`;
		} finally {
			aiTesting = false;
		}
	}
</script>

<svelte:head><title>Settings · Gapfill</title></svelte:head>

<div class="page">
	<h1>Settings</h1>

	<p class="warn">
		Everything here is stored only in <strong>this browser</strong>. Your database connection talks
		straight to Neon and never reaches this app's server. Azure & AI keys are proxied (for CORS) but
		never stored. Treat it like a password manager — keep it to devices you trust.
	</p>

	<section>
		<h2>Database (Neon)</h2>
		<label>
			<span>Connection string</span>
			<input
				bind:value={settings.dbUrl}
				type="password"
				placeholder="postgresql://user:pass@host/db?sslmode=require"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>
		<div class="decks">
			<span class="declabel">Decks <span class="hint">— one table each, e.g. a language or a list</span></span>
			<div class="chips">
				{#each settings.decks as d}
					<span class="deckchip" class:on={d === settings.dbTable}>
						<button class="pick" onclick={() => setActiveDeck(d)}>{d}</button>
						{#if settings.decks.length > 1}
							<button class="rm" onclick={() => removeDeck(d)} aria-label={`Remove ${d}`}>×</button>
						{/if}
					</span>
				{/each}
			</div>
			<div class="seed">
				<input
					bind:value={newDeck}
					onkeydown={(e) => e.key === 'Enter' && addDeckUI()}
					placeholder="new deck name — e.g. spanish"
					autocapitalize="none"
					autocorrect="off"
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="ghost" onclick={addDeckUI} disabled={!newDeck.trim()}>Add deck</button>
			</div>
		</div>
		<div class="row">
			<button class="ghost" onclick={testDb} disabled={dbBusy || !settings.dbUrl}>Test connection</button>
			<button class="ghost" onclick={initDb} disabled={dbBusy || !settings.dbUrl}>
				Create table
			</button>
		</div>
		{#if dbMsg}<p class="status" class:ok={dbMsg.startsWith('✓')}>{dbMsg}</p>{/if}
		<p class="hint">
			The highlighted deck is the active one — <strong>Test</strong> and <strong>Create table</strong>
			act on it. New deck or database? Add it, then hit <strong>Create table</strong>. Tip: use a
			Postgres role limited to these tables rather than your admin string.
		</p>
	</section>

	<section>
		<h2>Pronunciation (Azure Speech)</h2>
		<label>
			<span>Key</span>
			<input
				bind:value={settings.azureKey}
				type="password"
				placeholder="Azure Speech key"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>
		<label>
			<span>Region</span>
			<input
				bind:value={settings.azureRegion}
				placeholder="eastus"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
			/>
		</label>
	</section>

	<section>
		<h2>AI generation</h2>
		<p class="hint">Any OpenAI-compatible endpoint (OpenAI, OpenRouter, a local Ollama, …).</p>
		<label>
			<span>Base URL</span>
			<input
				bind:value={settings.ai.baseUrl}
				placeholder="https://api.openai.com/v1"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>
		<label>
			<span>API key</span>
			<input
				bind:value={settings.ai.apiKey}
				type="password"
				placeholder="sk-…"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>
		<label>
			<span>Model</span>
			<input bind:value={settings.ai.model} placeholder="gpt-4o-mini" autocapitalize="none" autocorrect="off" spellcheck="false" />
		</label>
		<div class="row">
			<button class="ghost" onclick={testAi} disabled={aiTesting}>{aiTesting ? 'Testing…' : 'Test'}</button>
		</div>
		{#if aiMsg}<p class="status" class:ok={aiMsg.startsWith('✓')}>{aiMsg}</p>{/if}
	</section>

	<section>
		<h2>Move to another device</h2>
		<p class="hint">
			Copy your whole setup as one code, then paste it on another phone or browser so you don't
			retype everything. It contains your keys — only share it with yourself.
		</p>
		<div class="row">
			<button class="ghost" onclick={copyConfig}>{copied ? 'Copied ✓' : 'Copy my config'}</button>
		</div>
		<label>
			<span>Paste a config code to import</span>
			<textarea
				bind:value={importText}
				rows="2"
				placeholder="gapfill:…"
				autocapitalize="none"
				spellcheck="false"
			></textarea>
		</label>
		<div class="row">
			<button class="ghost" onclick={doImport} disabled={!importText.trim()}>Import</button>
		</div>
		{#if importMsg}<p class="status" class:ok={importMsg.startsWith('✓')}>{importMsg}</p>{/if}
	</section>

	<div class="savebar">
		<button class="primary" onclick={persist}>{saved ? 'Saved ✓' : 'Save'}</button>
	</div>
</div>

<style>
	.page {
		padding: 8px 0 48px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	h1 {
		font-family: var(--serif);
		font-size: 30px;
		margin: 8px 0 0;
	}
	.warn {
		margin: 0;
		font-size: 13px;
		line-height: 1.55;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
	}
	.warn strong {
		color: var(--ink);
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 0;
	}
	.hint {
		font-size: 13px;
		color: var(--muted);
		margin: 0;
		line-height: 1.5;
	}
	.hint strong {
		color: var(--ink);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label span {
		font-size: 13px;
		color: var(--muted);
	}
	input,
	textarea {
		padding: 13px 15px;
		border: 1.5px solid var(--line);
		border-radius: 13px;
		background: var(--panel);
		color: var(--ink);
		outline: none;
		font-family: inherit;
		width: 100%;
		resize: vertical;
		line-height: 1.5;
	}
	input:focus,
	textarea:focus {
		border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
	}
	.decks {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.declabel {
		font-size: 13px;
		color: var(--muted);
	}
	.declabel .hint {
		display: inline;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.deckchip {
		display: inline-flex;
		align-items: center;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		overflow: hidden;
	}
	.deckchip.on {
		border-color: var(--ink);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.deckchip .pick {
		padding: 8px 12px;
		font-size: 14px;
		color: var(--ink);
	}
	.deckchip .rm {
		padding: 8px 11px 8px 4px;
		color: var(--muted);
		font-size: 16px;
		line-height: 1;
	}
	.seed {
		display: flex;
		gap: 10px;
	}
	.seed input {
		flex: 1;
		min-width: 0;
	}
	.row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 2px;
	}
	.primary {
		padding: 14px 28px;
		border-radius: 13px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
	}
	.ghost {
		padding: 12px 18px;
		border-radius: 13px;
		border: 1.5px solid var(--line);
		color: var(--ink);
	}
	.ghost:disabled {
		opacity: 0.45;
	}
	.status {
		font-size: 14px;
		color: var(--muted);
		margin: 0;
		line-height: 1.5;
		word-break: break-word;
	}
	.status.ok {
		color: var(--ok);
	}
	.savebar {
		position: sticky;
		bottom: 0;
		padding: 12px 0 calc(12px + var(--safe-bottom));
		background: linear-gradient(transparent, var(--bg) 30%);
		display: flex;
	}
	.savebar .primary {
		flex: 1;
	}
</style>
