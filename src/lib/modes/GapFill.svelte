<script lang="ts">
	import { onMount } from 'svelte';
	import { GAP, checkAnswer, makeQuizItems } from '$lib/gap';
	import { pickNext } from '$lib/quiz';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, dbReady, azureReady } from '$lib/settings.svelte';
	import Pronounce from '$lib/Pronounce.svelte';
	import type { QuizItem, WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	let items = $state<QuizItem[]>([]);
	let current = $state<QuizItem | null>(null);
	let value = $state('');
	let status = $state<'asking' | 'right' | 'wrong'>('asking');
	let showHint = $state(false);
	let seen = $state(0);
	let correct = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const parts = $derived(current ? current.masked.split(GAP) : ['', '']);

	onMount(() => {
		items = words.flatMap(makeQuizItems);
		current = pickNext(items);
	});

	function focusInput() {
		queueMicrotask(() => input?.focus());
	}

	function submit() {
		if (!current || status !== 'asking' || !value.trim()) return;
		seen += 1;
		const ok = checkAnswer(value, current);
		status = ok ? 'right' : 'wrong';
		if (ok) correct += 1;
		const delta = ok ? 1 : -1;
		const t = items.find((i) => i.id === current!.id);
		if (t) t.recollection = Math.max(0, t.recollection + delta);
		if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, current.id, delta).catch(() => {});
	}

	function next() {
		current = pickNext(items, current?.id);
		value = '';
		status = 'asking';
		showHint = false;
		focusInput();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (status === 'asking') submit();
		else next();
	}

	$effect(() => {
		if (current) focusInput();
	});
</script>

{#if !current}
	<div class="empty"><p class="muted">No gappable sentences in your words yet.</p></div>
{:else}
	<section class="card">
		<div class="meta">
			<span>{seen ? Math.round((correct / seen) * 100) : 0}%</span>
			<span class="dot">·</span>
			<span>{correct}/{seen}</span>
			{#if usingSample}<span class="sample">sample data</span>{/if}
		</div>

		<p class="sentence">
			{parts[0]}<span class="blank" class:right={status === 'right'} class:wrong={status === 'wrong'}>
				{#if status === 'asking'}<span class="rule"></span>{:else}{current.answer}{/if}
			</span>{parts[1]}
		</p>

		{#if status === 'wrong'}
			<p class="correction">answer: <strong>{current.headword}</strong></p>
		{/if}

		<div class="entry">
			<input
				bind:this={input}
				bind:value
				onkeydown={onKey}
				disabled={status !== 'asking'}
				placeholder="type the missing word"
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
				<button class="primary" onclick={next}>Next</button>
			{/if}
		</div>

		<button class="hint" onclick={() => (showHint = !showHint)}>{showHint ? 'hide hint' : 'hint'}</button>
		{#if showHint}<p class="definition">{current.definition}</p>{/if}

		{#if azureReady() && status !== 'asking'}
			<div class="say">
				<Pronounce word={current.headword} sentence={current.masked.replace(GAP, current.answer)} />
			</div>
		{/if}
	</section>
{/if}

<style>
	.card {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 22px;
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
	.sentence {
		font-family: var(--serif);
		font-size: clamp(22px, 5.4vw, 30px);
		line-height: 1.55;
		margin: 0;
		letter-spacing: -0.01em;
	}
	.blank {
		white-space: nowrap;
	}
	.blank .rule {
		display: inline-block;
		width: 2.6em;
		border-bottom: 2px solid var(--ink);
		vertical-align: baseline;
		margin: 0 2px;
	}
	.blank.right {
		color: var(--ok);
		font-weight: 600;
	}
	.blank.wrong {
		color: var(--bad);
		font-weight: 600;
	}
	.correction {
		margin: -6px 0 0;
		font-size: 15px;
		color: var(--muted);
	}
	.correction strong {
		color: var(--ok);
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
		transition: border-color 0.15s;
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
		transition: opacity 0.15s;
	}
	.primary:disabled {
		opacity: 0.35;
	}
	.hint {
		align-self: flex-start;
		font-size: 13px;
		color: var(--muted);
		padding: 4px 0;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.say {
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}
	.definition {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--muted);
		white-space: pre-line;
		border-left: 2px solid var(--line);
		padding-left: 14px;
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
