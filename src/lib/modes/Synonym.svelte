<script lang="ts">
	import { onMount } from 'svelte';
	import { pickWeighted } from '$lib/quiz';
	import { fetchSynonyms, fetchSynonymsAi, buildSynonymOptions, type SynonymOption } from '$lib/synonyms';
	import { exampleSentence } from '$lib/words';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, dbReady, aiReady, azureReady } from '$lib/settings.svelte';
	import Pronounce from '$lib/Pronounce.svelte';
	import type { WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	let current = $state<WordRow | null>(null);
	let options = $state<SynonymOption[]>([]);
	let picked = $state<number | null>(null);
	let loading = $state(false);
	let noData = $state(false);
	let seen = $state(0);
	let correct = $state(0);

	onMount(() => deal());

	async function deal(skipId?: number) {
		picked = null;
		noData = false;
		loading = true;
		// avoid an immediate repeat, and skip past words we just found unusable
		const tried = new Set<number>();
		let pick = pickWeighted(words, skipId ?? current?.id);
		while (pick && !tried.has(pick.id)) {
			tried.add(pick.id);
			current = pick;
			let syns = await fetchSynonyms(pick.word);
			if (syns.length === 0 && aiReady()) syns = await fetchSynonymsAi(settings.ai, pick.word);
			if (syns.length > 0) {
				options = buildSynonymOptions(syns, pick, words);
				loading = false;
				return;
			}
			if (tried.size >= Math.min(words.length, 8)) break;
			pick = pickWeighted(words, pick.id);
		}
		options = [];
		noData = true;
		loading = false;
	}

	function choose(i: number) {
		if (picked !== null || !current) return;
		picked = i;
		seen += 1;
		const ok = options[i].correct;
		if (ok) correct += 1;
		const delta = ok ? 1 : -1;
		const t = words.find((w) => w.id === current!.id);
		if (t) t.recollection = Math.max(0, t.recollection + delta);
		if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, current.id, delta).catch(() => {});
	}
</script>

{#if !current && !loading}
	<div class="empty"><p class="muted">No words to quiz yet.</p></div>
{:else}
	<section class="card">
		<div class="meta">
			<span>{seen ? Math.round((correct / seen) * 100) : 0}%</span>
			<span class="dot">·</span>
			<span>{correct}/{seen}</span>
			{#if usingSample}<span class="sample">sample data</span>{/if}
		</div>

		<p class="prompt">which word means the same as <strong>{current?.word.trim()}</strong>?</p>

		{#if loading}
			<p class="muted">finding synonyms…</p>
		{:else if noData}
			<p class="muted">couldn't find synonyms for these words.</p>
			<button class="primary" onclick={() => deal()}>Try again</button>
		{:else}
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
				<button class="primary" onclick={() => deal()}>Next</button>
				{#if azureReady() && current}
					<div class="say"><Pronounce word={current.word.trim()} sentence={exampleSentence(current)} /></div>
				{/if}
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
		gap: 20px;
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
	.prompt {
		font-family: var(--serif);
		font-size: clamp(22px, 5.2vw, 28px);
		margin: 0;
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
