<script lang="ts">
	import { onMount } from 'svelte';
	import { GAP, makeQuizItems } from '$lib/gap';
	import { pickNext } from '$lib/quiz';
	import { buildWordChoices, type ChoiceOption } from '$lib/words';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, dbReady, azureReady } from '$lib/settings.svelte';
	import Pronounce from '$lib/Pronounce.svelte';
	import type { QuizItem, WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	let items = $state<QuizItem[]>([]);
	let current = $state<QuizItem | null>(null);
	let options = $state<ChoiceOption[]>([]);
	let picked = $state<number | null>(null);
	let seen = $state(0);
	let correct = $state(0);

	const parts = $derived(current ? current.masked.split(GAP) : ['', '']);

	onMount(() => {
		items = words.flatMap(makeQuizItems);
		deal();
	});

	function deal() {
		current = pickNext(items, current?.id);
		options = current ? buildWordChoices(current.headword, words, current.id) : [];
		picked = null;
	}

	function choose(i: number) {
		if (picked !== null || !current) return;
		picked = i;
		seen += 1;
		const ok = options[i].correct;
		if (ok) correct += 1;
		const delta = ok ? 1 : -1;
		const t = items.find((it) => it.id === current!.id);
		if (t) t.recollection = Math.max(0, t.recollection + delta);
		if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, current.id, delta).catch(() => {});
	}
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
			{parts[0]}<span class="blank" class:right={picked !== null && options[picked].correct} class:wrong={picked !== null && !options[picked].correct}>
				{#if picked === null}<span class="rule"></span>{:else}{current.answer}{/if}
			</span>{parts[1]}
		</p>

		<div class="options">
			{#each options as o, i}
				<button
					class="option"
					class:correct={picked !== null && o.correct}
					class:wrong={picked === i && !o.correct}
					disabled={picked !== null}
					onclick={() => choose(i)}
				>
					<span class="letter">{String.fromCharCode(97 + i)}</span>
					<span class="text">{o.text}</span>
				</button>
			{/each}
		</div>

		{#if picked !== null}
			<button class="primary" onclick={deal}>Next</button>
			{#if azureReady()}
				<div class="say">
					<Pronounce word={current.headword} sentence={current.masked.replace(GAP, current.answer)} />
				</div>
			{/if}
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
	.options {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.option {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		text-align: left;
		padding: 14px 16px;
		border: 1.5px solid var(--line);
		border-radius: 14px;
		background: var(--panel);
		color: var(--ink);
		font-size: 15px;
		line-height: 1.45;
		transition: border-color 0.15s;
	}
	.option:not(:disabled):active {
		background: color-mix(in srgb, var(--ink) 5%, transparent);
	}
	.option.correct {
		border-color: var(--ok);
		color: var(--ok);
	}
	.option.wrong {
		border-color: var(--bad);
		color: var(--bad);
	}
	.letter {
		font-weight: 700;
		text-transform: uppercase;
		opacity: 0.6;
	}
	.primary {
		align-self: flex-start;
		padding: 13px 26px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
	}
	.say {
		padding-top: 12px;
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
