<script lang="ts">
	import { Recorder } from '$lib/audio';
	import { settings } from '$lib/settings.svelte';
	import type { PronounceResult } from '$lib/types';

	let { word }: { word: string } = $props();

	let phase = $state<'idle' | 'recording' | 'scoring'>('idle');
	let result = $state<PronounceResult | null>(null);
	let error = $state('');
	let rec: Recorder | null = null;

	// reset whenever the word changes
	$effect(() => {
		word;
		result = null;
		error = '';
		phase = 'idle';
	});

	function tone(s: number | null): string {
		if (s == null) return 'na';
		if (s >= 80) return 'good';
		if (s >= 60) return 'mid';
		return 'bad';
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
		let blob: Blob;
		try {
			blob = await rec!.stop();
		} catch (e) {
			error = (e as Error).message;
			phase = 'idle';
			return;
		}
		const fd = new FormData();
		fd.append('text', word);
		fd.append('audio', blob, 'speech.wav');
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
	<button class="mic" class:rec={phase === 'recording'} onclick={toggle} disabled={phase === 'scoring'}>
		<span class="ico">{phase === 'recording' ? '■' : '🎤'}</span>
		<span class="lbl">
			{#if phase === 'recording'}recording — tap to stop
			{:else if phase === 'scoring'}scoring…
			{:else if result}say it again
			{:else}say it{/if}
		</span>
	</button>

	{#if error}<p class="err">{error}</p>{/if}

	{#if result}
		<div class="scores">
			<span class="overall {tone(result.accuracy)}">{Math.round(result.accuracy ?? 0)}</span>
			<div class="phon">
				{#each result.words as w}
					{#each w.phonemes as p}
						<span class="ph {tone(p.accuracy)}" title={`${Math.round(p.accuracy ?? 0)}`}>{p.phoneme}</span>
					{/each}
				{/each}
				{#if result.words.every((w) => w.phonemes.length === 0)}
					<span class="muted">heard “{result.recognized || '—'}”</span>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.pron {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
