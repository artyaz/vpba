<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { MODES, modeState, setMode, modeLabel } from '$lib/mode.svelte';

	let { children } = $props();
	const onSettings = $derived(page.url.pathname.startsWith('/settings'));
	const onAdd = $derived(page.url.pathname.startsWith('/add'));
	const onHome = $derived(page.url.pathname === '/');

	let menuOpen = $state(false);

	function choose(id: (typeof MODES)[number]['id']) {
		setMode(id);
		menuOpen = false;
	}

	$effect(() => {
		if (!menuOpen) return;
		const close = () => (menuOpen = false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	});
</script>

<div class="app">
	<header>
		<a class="brand" href="/" aria-label="Home">Gapfill</a>
		<nav>
			{#if onHome}
				<div class="mode" onclick={(e) => e.stopPropagation()} role="presentation">
					<button class="modebtn" onclick={() => (menuOpen = !menuOpen)} aria-label="Practice mode">
						{modeLabel(modeState.id)}<span class="chev" class:open={menuOpen}>▾</span>
					</button>
					{#if menuOpen}
						<div class="menu">
							{#each MODES as m}
								<button class="item" class:on={m.id === modeState.id} onclick={() => choose(m.id)}>
									<span class="ml">{m.label}</span>
									<span class="mb">{m.blurb}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<a class="icon" href="/add" class:active={onAdd} aria-label="Add words">＋</a>
			<a class="icon" href="/settings" class:active={onSettings} aria-label="Settings">⚙</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding-top: var(--safe-top);
		padding-bottom: var(--safe-bottom);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		position: sticky;
		top: var(--safe-top);
		background: color-mix(in srgb, var(--bg) 86%, transparent);
		backdrop-filter: saturate(160%) blur(12px);
		-webkit-backdrop-filter: saturate(160%) blur(12px);
		z-index: 10;
	}
	.brand {
		font-weight: 600;
		letter-spacing: -0.02em;
		font-size: 17px;
		text-decoration: none;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.mode {
		position: relative;
	}
	.modebtn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 38px;
		padding: 0 12px;
		border-radius: 999px;
		font-size: 13px;
		color: var(--ink);
		border: 1.5px solid var(--line);
		background: var(--panel);
		white-space: nowrap;
	}
	.chev {
		font-size: 10px;
		color: var(--muted);
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 230px;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 6px;
		box-shadow: 0 12px 30px color-mix(in srgb, var(--ink) 16%, transparent);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 1px;
		text-align: left;
		padding: 9px 11px;
		border-radius: 10px;
	}
	.item:active {
		background: color-mix(in srgb, var(--ink) 7%, transparent);
	}
	.item.on {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	.ml {
		font-size: 14px;
		color: var(--ink);
	}
	.mb {
		font-size: 12px;
		color: var(--muted);
	}
	.icon {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 999px;
		font-size: 19px;
		text-decoration: none;
		color: var(--muted);
		transition: background 0.15s, color 0.15s;
	}
	.icon:active {
		background: color-mix(in srgb, var(--ink) 10%, transparent);
	}
	.icon.active {
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		padding: 0 22px;
	}
</style>
