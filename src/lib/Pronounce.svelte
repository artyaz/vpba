<script lang="ts">
	import { Recorder } from '$lib/audio';
	import { settings } from '$lib/settings.svelte';
	import type { PronounceResult } from '$lib/types';

	let { word, sentence = '' }: { word: string; sentence?: string } = $props();

	let mode = $state<'word' | 'sentence'>('word');
	let phase = $state<'idle' | 'recording' | 'scoring'>('idle');
	let result = $state<PronounceResult | null>(null);
	let error = $state('');
	let rec: Recorder | null = null;

	const reference = $derived(mode === 'sentence' && sentence ? sentence : word);
	const tips = $derived(result ? weakPhonemes(result) : []);
	const multiWord = $derived((result?.words.length ?? 0) > 1);

	// reset whenever the word changes
	$effect(() => {
		word;
		result = null;
		error = '';
		phase = 'idle';
	});

	function setMode(m: 'word' | 'sentence') {
		if (m === mode) return;
		mode = m;
		result = null;
		error = '';
	}

	function tone(s: number | null): string {
		if (s == null) return 'na';
		if (s >= 80) return 'good';
		if (s >= 60) return 'mid';
		return 'bad';
	}

	function round(n: number | null): number {
		return Math.round(n ?? 0);
	}

	function statList(r: PronounceResult) {
		return (
			[
				{ label: 'accuracy', v: r.accuracy },
				{ label: 'fluency', v: r.fluency },
				{ label: 'completeness', v: r.completeness },
				{ label: 'prosody', v: r.prosody }
			] as { label: string; v: number | null }[]
		).filter((s) => s.v != null) as { label: string; v: number }[];
	}

	/** Lowest-scoring phonemes (with what Azure thinks it heard instead). */
	function weakPhonemes(r: PronounceResult) {
		const out: { phoneme: string; accuracy: number; heard?: string; word: string }[] = [];
		for (const w of r.words) {
			for (const p of w.phonemes) {
				if (p.accuracy != null && p.accuracy < 60) {
					const alt = p.nbest?.find((n) => n.phoneme !== p.phoneme);
					out.push({ phoneme: p.phoneme, accuracy: p.accuracy, heard: alt?.phoneme, word: w.word });
				}
			}
		}
		return out.sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
	}

	function errLabel(t: string): string {
		if (t === 'Omission') return 'you skipped that one';
		if (t === 'Insertion') return 'extra sound in there';
		if (t === 'Mispronunciation') return 'a bit off';
		return '';
	}

	function micError(e: unknown): string {
		const n = (e as Error).name;
		if (n === 'NotAllowedError') return 'Microphone permission denied.';
		if (n === 'NotFoundError') return 'No microphone found.';
		return 'Could not start the microphone.';
	}

	async function toggle() {
		if (phase === 'scoring') return;

		if (phase === 'idle') {
			error = '';
			result = null;
			try {
				rec = new Recorder();
				await rec.start();
				phase = 'recording';
			} catch (e) {
				error = micError(e);
				phase = 'idle';
			}
			return;
		}

		// phase === 'recording' → stop and score
		phase = 'scoring';
		let rec_;
		try {
			rec_ = await rec!.stop();
		} catch (e) {
			error = (e as Error).message;
			phase = 'idle';
			return;
		}
		if (rec_.peak < 0.012) {
			error = "didn't pick up any sound — check the mic isn't muted and try a bit louder.";
			phase = 'idle';
			return;
		}
		const fd = new FormData();
		fd.append('text', reference);
		fd.append('audio', rec_.blob, 'speech.wav');
		fd.append('key', settings.azureKey);
		fd.append('region', settings.azureRegion);
		try {
			const res = await fetch('/api/pronounce', { method: 'POST', body: fd });
			const data = await res.json();
			if (!res.ok || data.error) error = data.error ?? 'Scoring failed.';
			else result = data;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			phase = 'idle';
		}
	}
</script>

<div class="pron">
	{#if sentence}
		<div class="modes">
			<button class:on={mode === 'word'} onclick={() => setMode('word')}>word</button>
			<button class:on={mode === 'sentence'} onclick={() => setMode('sentence')}>sentence</button>
		</div>
	{/if}

	<button class="mic" class:rec={phase === 'recording'} onclick={toggle} disabled={phase === 'scoring'}>
		<span class="ico">{phase === 'recording' ? '■' : '🎤'}</span>
		<span class="lbl">
			{#if phase === 'recording'}recording — tap to stop
			{:else if phase === 'scoring'}scoring…
			{:else if result}say it again
			{:else}say {mode === 'sentence' ? 'the sentence' : 'it'}{/if}
		</span>
	</button>

	{#if error}<p class="err">{error}</p>{/if}

	{#if result}
		<div class="result">
			<div class="scores">
				<span class="overall {tone(result.pron ?? result.accuracy)}">{round(result.pron ?? result.accuracy)}</span>
				<div class="stats">
					{#each statList(result) as s}
						<span class="stat"><b class={tone(s.v)}>{round(s.v)}</b> {s.label}</span>
					{/each}
				</div>
			</div>

			{#if multiWord}
				<div class="phon">
					{#each result.words as w}
						<span class="ph {tone(w.accuracy)}" title={`${round(w.accuracy)}`}>{w.word}</span>
					{/each}
				</div>
			{:else if result.words.some((w) => w.phonemes.length)}
				<div class="phon">
					{#each result.words as w}
						{#each w.phonemes as p}
							<span class="ph {tone(p.accuracy)}" title={`${round(p.accuracy)}`}>{p.phoneme}</span>
						{/each}
					{/each}
				</div>
			{/if}

			{#each result.words as w}
				{#if w.errorType && w.errorType !== 'None'}
					<p class="muted">“{w.word}” — {errLabel(w.errorType)}</p>
				{/if}
			{/each}

			{#if tips.length}
				<p class="muted tiplead">work on these sounds</p>
				<ul class="tips">
					{#each tips as t}
						<li>
							{#if multiWord}<span class="muted">{t.word}:</span>{/if}
							<span class="ph bad">{t.phoneme}</span>
							{#if t.heard}sounded more like <span class="ph mid">{t.heard}</span>{:else}came out unclear{/if}
							<span class="muted">({round(t.accuracy)})</span>
						</li>
					{/each}
				</ul>
			{:else if result.words.some((w) => w.phonemes.length)}
				<p class="muted">clean across the board 👌</p>
			{/if}

			<p class="muted heard">heard: {result.recognized || '—'}</p>
		</div>
	{/if}
</div>

<style>
	.pron {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.modes {
		display: flex;
		gap: 2px;
		align-self: flex-start;
		font-size: 13px;
	}
	.modes button {
		padding: 4px 11px;
		border-radius: 999px;
		color: var(--muted);
	}
	.modes button.on {
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.tiplead {
		margin: 2px 0 -4px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.mic {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 10px 16px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--panel);
		font-size: 14px;
	}
	.mic:disabled {
		opacity: 0.6;
	}
	.mic.rec {
		border-color: var(--bad);
		color: var(--bad);
		animation: pulse 1.1s ease-in-out infinite;
	}
	.ico {
		font-size: 15px;
		line-height: 1;
	}
	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}

	.result {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.scores {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.overall {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 22px;
		width: 46px;
		height: 46px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		border: 2px solid currentColor;
		flex: none;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 12px;
		color: var(--muted);
	}
	.stat {
		font-variant-numeric: tabular-nums;
	}
	.stat b {
		font-weight: 700;
	}
	.tips {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.tips li {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 14px;
		color: var(--muted);
		flex-wrap: wrap;
	}
	.heard {
		font-size: 13px;
	}
	.phon {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
	}
	.ph {
		font-family: 'SF Mono', ui-monospace, Menlo, monospace;
		font-size: 13px;
		padding: 4px 8px;
		border-radius: 7px;
		border: 1px solid currentColor;
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
	.na {
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		font-size: 14px;
	}
	.err {
		color: var(--bad);
		font-size: 14px;
		margin: 0;
	}
</style>
