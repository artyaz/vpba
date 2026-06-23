<script lang="ts">
	import { settings, aiReady, dbReady } from '$lib/settings.svelte';
	import { insertWord } from '$lib/db.client';
	import type { GeneratedWord } from '$lib/types';

	let term = $state('');
	let similar = $state<string[]>([]);
	let loadingSimilar = $state(false);

	let generating = $state(false);
	let genError = $state('');

	let word = $state('');
	let definition = $state('');
	let sentences = $state<string[]>([]);

	let saving = $state(false);
	let saveMsg = $state('');

	async function findSimilar() {
		const seed = term.trim();
		if (!seed) return;
		loadingSimilar = true;
		try {
			// Datamuse is public + CORS-enabled, so we call it straight from the browser.
			const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(seed)}&max=16`);
			const data = (await res.json()) as Array<{ word: string }>;
			const seen = new Set([seed.toLowerCase()]);
			similar = data
				.map((d) => d.word)
				.filter((w) => {
					const k = w.toLowerCase();
					if (seen.has(k)) return false;
					seen.add(k);
					return true;
				});
		} catch {
			similar = [];
		} finally {
			loadingSimilar = false;
		}
	}

	async function generate(target = term) {
		const t = target.trim();
		if (!t) return;
		if (!aiReady()) {
			genError = 'Configure an AI endpoint in Settings first.';
			return;
		}
		term = t;
		generating = true;
		genError = '';
		saveMsg = '';
		word = '';
		try {
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ config: { ...settings.ai }, word: t })
			});
			const body = await res.json();
			if (!res.ok) {
				genError = body.error ?? 'Generation failed.';
				return;
			}
			const g: GeneratedWord = body.generated;
			word = g.word || t;
			definition = g.definition;
			sentences = g.sentences.length ? g.sentences : ['', '', ''];
		} catch (e) {
			genError = (e as Error).message;
		} finally {
			generating = false;
		}
	}

	async function save() {
		const clean = sentences.map((s) => s.trim()).filter(Boolean);
		if (!word.trim() || clean.length === 0) return;
		if (!dbReady()) {
			saveMsg = 'Connect your database in Settings to save.';
			return;
		}
		const sentence = clean.map((s, i) => `${i + 1}. ${s}`).join('\n');
		saving = true;
		saveMsg = '';
		try {
			await insertWord(settings.dbUrl, settings.dbTable, word.trim(), definition.trim(), sentence);
			saveMsg = `Saved “${word.trim()}” ✓`;
			word = '';
			definition = '';
			sentences = [];
			term = '';
		} catch (e) {
			saveMsg = (e as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Add words · Gapfill</title></svelte:head>

<div class="page">
	<h1>Add words</h1>

	{#if !aiReady()}
		<p class="note">
			AI generation needs an endpoint. <a href="/settings">Set one up →</a> You can still browse
			similar words below.
		</p>
	{/if}

	<div class="seed">
		<input
			bind:value={term}
			onkeydown={(e) => e.key === 'Enter' && generate()}
			placeholder="a word, phrase or idiom — e.g. pan out"
			autocapitalize="none"
			autocorrect="off"
			autocomplete="off"
			spellcheck="false"
			enterkeyhint="go"
		/>
		<button class="primary" onclick={() => generate()} disabled={generating || !term.trim()}>
			{generating ? '…' : 'Generate'}
		</button>
	</div>

	<button class="link" onclick={findSimilar} disabled={loadingSimilar || !term.trim()}>
		{loadingSimilar ? 'finding…' : 'find similar-level words'}
	</button>

	{#if similar.length}
		<div class="chips">
			{#each similar as s}
				<button class="chip" onclick={() => generate(s)}>{s}</button>
			{/each}
		</div>
	{/if}

	{#if genError}<p class="err">{genError}</p>{/if}

	{#if word}
		<section class="preview">
			<label>
				<span>Word</span>
				<input bind:value={word} autocapitalize="none" autocorrect="off" spellcheck="false" />
			</label>
			<label>
				<span>Definition</span>
				<textarea bind:value={definition} rows="5"></textarea>
			</label>
			<span class="lbl">Sentences</span>
			{#each sentences as _, i}
				<textarea bind:value={sentences[i]} rows="2" placeholder={`sentence ${i + 1}`}></textarea>
			{/each}
			<div class="row">
				<button class="primary" onclick={save} disabled={saving}>
					{saving ? 'Saving…' : 'Save to my words'}
				</button>
				<button class="ghost" onclick={() => generate(word)} disabled={generating}>Regenerate</button>
			</div>
		</section>
	{/if}

	{#if saveMsg}<p class="ok">{saveMsg}</p>{/if}
</div>

<style>
	.page {
		padding: 8px 0 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 {
		font-family: var(--serif);
		font-size: 30px;
		margin: 8px 0 4px;
	}
	.note {
		font-size: 14px;
		color: var(--muted);
		margin: 0;
		line-height: 1.5;
	}
	.note a {
		color: var(--ink);
	}
	.seed {
		display: flex;
		gap: 10px;
	}
	.seed input {
		flex: 1;
		min-width: 0;
		padding: 14px 16px;
		border: 1.5px solid var(--line);
		border-radius: 14px;
		background: var(--panel);
		color: var(--ink);
		outline: none;
	}
	.seed input:focus {
		border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
	}
	.primary {
		padding: 14px 20px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
		white-space: nowrap;
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.link {
		align-self: flex-start;
		font-size: 13px;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 3px;
		padding: 2px 0;
	}
	.link:disabled {
		opacity: 0.5;
		text-decoration: none;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		padding: 8px 13px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--panel);
		font-size: 14px;
	}
	.chip:active {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
		margin-top: 6px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label span,
	.lbl {
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
		width: 100%;
		font-family: inherit;
		line-height: 1.5;
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
	}
	.row {
		display: flex;
		gap: 10px;
		margin-top: 4px;
	}
	.ghost {
		padding: 14px 20px;
		border-radius: 14px;
		border: 1.5px solid var(--line);
		color: var(--ink);
	}
	.err {
		color: var(--bad);
		font-size: 14px;
		margin: 0;
	}
	.ok {
		color: var(--ok);
		font-size: 14px;
		margin: 0;
	}
</style>
