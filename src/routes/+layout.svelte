<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();
	const onSettings = $derived(page.url.pathname.startsWith('/settings'));
	const onAdd = $derived(page.url.pathname.startsWith('/add'));
</script>

<div class="app">
	<header>
		<a class="brand" href="/" aria-label="Home">Gapfill</a>
		<nav>
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
		gap: 6px;
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
