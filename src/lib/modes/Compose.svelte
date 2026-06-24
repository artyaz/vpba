<script lang="ts">
	import { onMount } from 'svelte';
	import { pickWeighted } from '$lib/quiz';
	import { shortDef } from '$lib/words';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, dbReady, aiReady, azureReady } from '$lib/settings.svelte';
	import Pronounce from '$lib/Pronounce.svelte';
	import type { WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	interface Rating {
		score: number;
		verdict: string;
		feedback: string;
		better: string;
	}

	let current = $state<WordRow | null>(null);
	let value = $state('');
	let phase = $state<'writing' | 'rating' | 'done'>('writing');
	let rating = $state<Rating | null>(null);
	let error = $state('');
	let seen = $state(0);
	let correct = $state(0);

	onMount(() => deal());

	function deal() {
		current = pickWeighted(words, current?.id);
		value = '';
		rating = null;
		error = '';
		phase = 'writing';
	}

	function tone(s: number): string {
		if (s >= 80) return 'good';
		if (s >= 60) return 'mid';
		return 'bad';
	}

	async function rate() {
		if (!current || !value.trim()) return;
		phase = 'rating';
		error = '';
		try {
			const res = await fetch('/api/rate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					config: { ...settings.ai },
					word: current.word.trim(),
					definition: shortDef(current.definition),
					sentence: value
				})
			});
			const body = await res.json();
			if (!res.ok || body.error) {
				error = body.error ?? 'Rating failed.';
				phase = 'writing';
				return;
			}
			rating = body.rating;
			phase = 'done';
			seen += 1;
			const ok = (rating?.score ?? 0) >= 70;
			if (ok) correct += 1;
			const delta = ok ? 1 : -1;
			const t = words.find((w) => w.id === current!.id);
			if (t) t.recollection = Math.max(0, t.recollection + delta);
			if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, current.id, delta).catch(() => {});
		} catch (e) {
			error = (e as Error).message;
			phase = 'writing';
		}
	}
</script>

{#if !aiReady()}
	<div class="empty">
		<p class="big">This mode needs the AI.</p>
		<p class="muted">It grades your sentence, so add an AI endpoint in settings.</p>
		<a class="cta" href="/settings">Set it up →</a>
	</div>
{:else if !current}
	<div class="empty"><p class="muted">No words to practise yet.</p></div>
{:else}
	<section class="card">
		<div class="meta">
			<span>{seen ? Math.round((correct / seen) * 100) : 0}%</span>
			<span class="dot">·</span>
			<span>{correct}/{seen}</span>
			{#if usingSample}<span class="sample">sample data</span>{/if}
		</div>

		<div>
			<p class="prompt">write a sentence with <strong>{current.word.trim()}</strong></p>
			<p class="gloss">{shortDef(current.definition)}</p>
		</div>

		<textarea
			bind:value
			disabled={phase !== 'writing'}
			rows="3"
			placeholder="make it interesting, not textbook…"
			autocapitalize="sentences"
		></textarea>

		{#if error}<p class="err">{error}</p>{/if}

		{#if phase !== 'done'}
			<button class="primary" onclick={rate} disabled={phase === 'rating' || !value.trim()}>
				{phase === 'rating' ? 'grading…' : 'Rate it'}
			</button>
		{:else if rating}
			<div class="result">
				<div class="head">
					<span class="score {tone(rating.score)}">{rating.score}</span>
					<span class="verdict {tone(rating.score)}">{rating.verdict}</span>
				</div>
				<p class="feedback">{rating.feedback}</p>
				{#if rating.better}
					<p class="better"><span class="muted">sharper:</span> {rating.better}</p>
				{/if}
			</div>
			<button class="primary" onclick={deal}>Next word</button>
			{#if azureReady()}
				<div class="say"><Pronounce word={current.word.trim()} sentence={value} /></div>
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
		gap: 16px;
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
		margin: 0 0 6px;
	}
	.gloss {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
		line-height: 1.5;
	}
	textarea {
		padding: 14px 16px;
		border: 1.5px solid var(--line);
		border-radius: 14px;
		background: var(--panel);
		color: var(--ink);
		outline: none;
		font-family: inherit;
		font-size: 16px;
		line-height: 1.5;
		resize: vertical;
	}
	textarea:focus {
		border-color: color-mix(in srgb, var(--ink) 45%, var(--line));
	}
	.primary {
		align-self: flex-start;
		padding: 13px 26px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-left: 2px solid var(--line);
		padding-left: 14px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.score {
		font-size: 26px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.verdict {
		font-size: 15px;
		font-weight: 600;
	}
	.feedback {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
	}
	.better {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
		font-style: italic;
	}
	.good {
		color: var(--ok);
	}
	.mid {
		color: var(--warn);
	}
	.bad {
		color: var(--bad);
	}
	.muted {
		color: var(--muted);
		font-style: normal;
	}
	.err {
		color: var(--bad);
		font-size: 14px;
		margin: 0;
	}
	.say {
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		text-align: center;
	}
	.empty .big {
		font-family: var(--serif);
		font-size: 24px;
		margin: 0;
	}
	.cta {
		margin-top: 12px;
		padding: 12px 22px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		text-decoration: none;
		font-weight: 600;
	}
</style>
