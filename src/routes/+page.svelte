<script lang="ts">
	import { getWords } from '$lib/db.client';
	import { SAMPLE_WORDS } from '$lib/sample';
	import { settings, dbReady } from '$lib/settings.svelte';
	import { modeState } from '$lib/mode.svelte';
	import GapFill from '$lib/modes/GapFill.svelte';
	import GapSelect from '$lib/modes/GapSelect.svelte';
	import Choice from '$lib/modes/Choice.svelte';
	import Recall from '$lib/modes/Recall.svelte';
	import Synonym from '$lib/modes/Synonym.svelte';
	import Compose from '$lib/modes/Compose.svelte';
	import Showdown from '$lib/modes/Showdown.svelte';
	import type { WordRow } from '$lib/types';

	let words = $state<WordRow[]>([]);
	let loading = $state(true);
	let loadError = $state('');
	let usingSample = $state(false);

	async function load() {
		loading = true;
		loadError = '';
		try {
			if (dbReady()) {
				words = await getWords(settings.dbUrl, settings.dbTable);
				usingSample = false;
			} else {
				words = SAMPLE_WORDS;
				usingSample = true;
			}
		} catch (e) {
			loadError = (e as Error).message;
			words = [];
		} finally {
			loading = false;
		}
	}

	// reload whenever the page mounts or the active deck (table) changes
	$effect(() => {
		settings.dbTable;
		load();
	});
</script>

<svelte:head><title>Gapfill</title></svelte:head>

{#if loading}
	<div class="empty"><p class="muted">Loading…</p></div>
{:else if loadError}
	<div class="empty">
		<p class="big">Couldn't reach your database.</p>
		<p class="muted">{loadError}</p>
		<a class="cta" href="/settings">Check connection</a>
	</div>
{:else if !words.length}
	<div class="empty">
		<p class="big">No words yet.</p>
		<p class="muted">{dbReady() ? 'Add some and come back.' : 'Connect your database in settings.'}</p>
		<a class="cta" href={dbReady() ? '/add' : '/settings'}>{dbReady() ? 'Add words' : 'Settings'}</a>
	</div>
{:else if modeState.id === 'gap'}
	{#key words}<GapFill {words} {usingSample} />{/key}
{:else if modeState.id === 'gapselect'}
	{#key words}<GapSelect {words} {usingSample} />{/key}
{:else if modeState.id === 'choice'}
	{#key words}<Choice {words} {usingSample} />{/key}
{:else if modeState.id === 'recall'}
	{#key words}<Recall {words} {usingSample} />{/key}
{:else if modeState.id === 'synonym'}
	{#key words}<Synonym {words} {usingSample} />{/key}
{:else if modeState.id === 'compose'}
	{#key words}<Compose {words} {usingSample} />{/key}
{:else if modeState.id === 'showdown'}
	{#key words}<Showdown {words} {usingSample} />{/key}
{/if}

<style>
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
	.muted {
		color: var(--muted);
		margin: 0;
	}
	.cta {
		margin-top: 14px;
		padding: 13px 24px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		text-decoration: none;
		font-weight: 600;
	}
</style>
