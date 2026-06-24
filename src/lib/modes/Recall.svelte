<script lang="ts">
	import { onMount } from 'svelte';
	import { normalize } from '$lib/gap';
	import { pickWeighted } from '$lib/quiz';
	import { shortDef, redact, exampleSentence } from '$lib/words';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, dbReady, azureReady } from '$lib/settings.svelte';
	import Pronounce from '$lib/Pronounce.svelte';
	import type { WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	let current = $state<WordRow | null>(null);
	let value = $state('');
	let status = $state<'asking' | 'right' | 'wrong'>('asking');
	let seen = $state(0);
	let correct = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const clue = $derived(current ? redact(shortDef(current.definition), current.word) : '');

	onMount(() => deal());

	function focusInput() {
		queueMicrotask(() => input?.focus());
	}

	function deal() {
		current = pickWeighted(words, current?.id);
		value = '';
		status = 'asking';
		focusInput();
	}

	function submit() {
		if (!current || status !== 'asking' || !value.trim()) return;
		seen += 1;
		const ok = normalize(value) === normalize(current.word);
		status = ok ? 'right' : 'wrong';
		if (ok) correct += 1;
		const delta = ok ? 1 : -1;
		const t = words.find((w) => w.id === current!.id);
		if (t) t.recollection = Math.max(0, t.recollection + delta);
		if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, current.id, delta).catch(() => {});
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (status === 'asking') submit();
		else deal();
	}
</script>

{#if !current}
	<div class="empty"><p class="muted">No words to recall yet.</p></div>
{:else}
	<section class="card">
		<div class="meta">
			<span>{seen ? Math.round((correct / seen) * 100) : 0}%</span>
			<span class="dot">·</span>
			<span>{correct}/{seen}</span>
			{#if usingSample}<span class="sample">sample data</span>{/if}
		</div>

		<p class="lead">which word is this?</p>
		<p class="clue">{clue}</p>

		{#if status !== 'asking'}
			<p class="answer {status}">{current.word.trim()}</p>
		{/if}

		<div class="entry">
			<input
				bind:this={input}
				bind:value
				onkeydown={onKey}
				disabled={status !== 'asking'}
				placeholder="the word"
				autocapitalize="none"
				autocorrect="off"
				autocomplete="off"
				spellcheck="false"
				enterkeyhint="go"
				class:right={status === 'right'}
				class:wrong={status === 'wrong'}
			/>
			{#if status === 'asking'}
				<button class="primary" onclick={submit} disabled={!value.trim()}>Check</button>
			{:else}
				<button class="primary" onclick={deal}>Next</button>
			{/if}
		</div>

		{#if azureReady() && status !== 'asking'}
			<div class="say"><Pronounce word={current.word.trim()} sentence={exampleSentence(current)} /></div>
		{/if}
	</section>
{/if}

<style>
	.card {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 18px;
		padding: 18px 0 40px;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.dot {
		opacity: 0.5;
	}
	.sample {
		margin-left: auto;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border: 1px solid var(--line);
		padding: 2px 7px;
		border-radius: 999px;
	}
	.lead {
		font-size: 13px;
		color: var(--muted);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.clue {
		font-family: var(--serif);
		font-size: clamp(20px, 4.8vw, 26px);
		line-height: 1.5;
		margin: 0;
	}
	.answer {
		font-family: var(--serif);
		font-size: 22px;
		margin: 0;
		font-weight: 600;
	}
	.answer.right {
		color: var(--ok);
	}
	.answer.wrong {
		color: var(--bad);
	}
	.entry {
		display: flex;
		gap: 10px;
	}
	input {
		flex: 1;
		min-width: 0;
		padding: 14px 16px;
		border: 1.5px solid var(--line);
		border-radius: 14px;
		background: var(--panel);
		color: var(--ink);
		outline: none;
	}
	input:focus {
		border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
	}
	input.right {
		border-color: var(--ok);
	}
	input.wrong {
		border-color: var(--bad);
	}
	.primary {
		padding: 14px 22px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
		white-space: nowrap;
	}
	.primary:disabled {
		opacity: 0.35;
	}
	.say {
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}
	.empty {
		flex: 1;
		display: grid;
		place-items: center;
	}
	.muted {
		color: var(--muted);
	}
</style>
