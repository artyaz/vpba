<script lang="ts">
	import { GAP, makeQuizItems, checkAnswer, normalize } from '$lib/gap';
	import { buildChoices, buildWordChoices, shortDef, redact, type ChoiceOption } from '$lib/words';
	import { fetchSynonyms, fetchSynonymsAi, buildSynonymOptions, type SynonymOption } from '$lib/synonyms';
	import { bumpRecollection } from '$lib/db.client';
	import { settings, save, dbReady, aiReady } from '$lib/settings.svelte';
	import { speak, stopSpeaking, ttsReady } from '$lib/tts';
	import type { QuizItem, WordRow } from '$lib/types';

	let { words, usingSample }: { words: WordRow[]; usingSample: boolean } = $props();

	const ROUND_CHOICES = [5, 10, 15, 20];

	type Round =
		| { kind: 'gap'; word: WordRow; item: QuizItem }
		| { kind: 'gapselect'; word: WordRow; item: QuizItem; options: ChoiceOption[] }
		| { kind: 'choice'; word: WordRow; options: ChoiceOption[] }
		| { kind: 'recall'; word: WordRow; clue: string }
		| { kind: 'syn'; word: WordRow; options: SynonymOption[] };

	const KIND_LABEL: Record<Round['kind'], string> = {
		gap: 'fill the gap',
		gapselect: 'fill the gap',
		choice: 'pick the meaning',
		recall: 'name the word',
		syn: 'pick the synonym'
	};

	function setRounds(n: number) {
		settings.showdownRounds = n;
		save();
	}

	let phase = $state<'idle' | 'loading' | 'playing' | 'done'>('idle');
	let rounds = $state<Round[]>([]);
	let index = $state(0);
	let value = $state('');
	let picked = $state<number | null>(null);
	let answered = $state(false);
	let lastCorrect = $state(false);
	let score = $state(0);
	let trio = $state<WordRow[]>([]);
	let input = $state<HTMLInputElement | null>(null);

	const current = $derived(rounds[index] ?? null);
	const parts = $derived(
		current?.kind === 'gap' || current?.kind === 'gapselect' ? current.item.masked.split(GAP) : ['', '']
	);

	function sample<T>(arr: T[], n: number): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a.slice(0, n);
	}

	const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

	function makeRound(kind: Round['kind'], word: WordRow, syns: string[]): Round | null {
		if (kind === 'gap') {
			const items = makeQuizItems(word);
			return items.length ? { kind, word, item: rand(items) } : null;
		}
		if (kind === 'gapselect') {
			const items = makeQuizItems(word);
			if (!items.length) return null;
			const item = rand(items);
			return { kind, word, item, options: buildWordChoices(item.headword, words, word.id) };
		}
		if (kind === 'choice') return { kind, word, options: buildChoices(word, words) };
		if (kind === 'recall') return { kind, word, clue: redact(shortDef(word.definition), word.word) };
		return syns.length ? { kind, word, options: buildSynonymOptions(syns, word, words) } : null;
	}

	/** Simple "select" types — tap-to-pick, used to warm up on every word first. */
	function simpleKinds(word: WordRow, syns: string[]): Round['kind'][] {
		const kinds: Round['kind'][] = ['choice'];
		if (makeQuizItems(word).length) kinds.push('gapselect');
		if (syns.length) kinds.push('syn');
		return kinds;
	}

	/** Harder typing types — recall the word / type the missing word. */
	function complexKinds(word: WordRow): Round['kind'][] {
		const kinds: Round['kind'][] = ['recall'];
		if (makeQuizItems(word).length) kinds.push('gap');
		return kinds;
	}

	/** Build one round of a random feasible kind for a word, avoiding repeating `prev`. */
	function buildOne(
		w: WordRow,
		syns: string[],
		kinds: Round['kind'][],
		prev: Round | undefined
	): Round | null {
		for (const kind of sample(kinds, kinds.length)) {
			if (prev && prev.word.id === w.id && prev.kind === kind) continue;
			const round = makeRound(kind, w, syns);
			if (round) return round;
		}
		return null;
	}

	async function start() {
		phase = 'loading';
		stopSpeaking();
		trio = sample(words, Math.min(3, words.length));

		const synMap = new Map<number, string[]>();
		await Promise.all(
			trio.map(async (w) => {
				let s = await fetchSynonyms(w.word);
				if (s.length === 0 && aiReady()) s = await fetchSynonymsAi(settings.ai, w.word);
				synMap.set(w.id, s);
			})
		);

		const syns = (w: WordRow) => synMap.get(w.id) ?? [];
		const target = Math.max(1, settings.showdownRounds || 10);

		// phase 1 — one simple/recognition round per word, all words, shuffled together,
		// so you recognise every word before the harder drilling starts.
		const warmup: Round[] = [];
		for (const w of trio) {
			const r = buildOne(w, syns(w), simpleKinds(w, syns(w)), undefined);
			if (r) warmup.push(r);
		}
		const phase1 = sample(warmup, warmup.length);

		// phase 2 — the harder typing exercises, shuffled across all words.
		const phase2: Round[] = [];
		let guard = 0;
		const need = Math.max(0, target - phase1.length);
		while (phase2.length < need && guard < need * 12 + 12) {
			guard++;
			const w = rand(trio);
			const r = buildOne(w, syns(w), complexKinds(w), phase2[phase2.length - 1]);
			if (r) phase2.push(r);
		}

		rounds = [...phase1.slice(0, target), ...phase2];
		index = 0;
		score = 0;
		resetRound();
		phase = rounds.length ? 'playing' : 'idle';
	}

	function resetRound() {
		value = '';
		picked = null;
		answered = false;
		lastCorrect = false;
		stopSpeaking();
		if (current?.kind === 'gap' || current?.kind === 'recall') queueMicrotask(() => input?.focus());
	}

	function settle(ok: boolean, word: WordRow) {
		answered = true;
		lastCorrect = ok;
		if (ok) score += 1;
		const delta = ok ? 1 : -1;
		const t = words.find((w) => w.id === word.id);
		if (t) t.recollection = Math.max(0, t.recollection + delta);
		if (dbReady()) bumpRecollection(settings.dbUrl, settings.dbTable, word.id, delta).catch(() => {});
	}

	function submitText() {
		if (!current || answered || !value.trim()) return;
		if (current.kind === 'gap') settle(checkAnswer(value, current.item), current.word);
		else if (current.kind === 'recall') settle(normalize(value) === normalize(current.word.word), current.word);
	}

	function choose(i: number) {
		if (!current || answered) return;
		if (current.kind !== 'choice' && current.kind !== 'syn' && current.kind !== 'gapselect') return;
		picked = i;
		settle(current.options[i].correct, current.word);
	}

	function next() {
		if (index + 1 >= rounds.length) {
			phase = 'done';
			stopSpeaking();
			return;
		}
		index += 1;
		resetRound();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (!answered) submitText();
		else next();
	}

	function answerWord(): string {
		if (!current) return '';
		if (current.kind === 'gap' || current.kind === 'gapselect') return current.item.headword;
		return current.word.word.trim();
	}
</script>

{#if !words.length}
	<div class="empty"><p class="muted">No words to play with yet.</p></div>
{:else if phase === 'idle'}
	<div class="empty">
		<p class="big">Showdown</p>
		<p class="muted">3 random words, a rapid-fire mix of every exercise. Beat your best.</p>
		<div class="rounds">
			<span class="rlabel">rounds</span>
			<div class="rchips">
				{#each ROUND_CHOICES as n}
					<button class="rchip" class:on={settings.showdownRounds === n} onclick={() => setRounds(n)}>{n}</button>
				{/each}
			</div>
		</div>
		<button class="cta" onclick={start}>Start</button>
		{#if usingSample}<span class="sample">sample data</span>{/if}
	</div>
{:else if phase === 'loading'}
	<div class="empty"><p class="muted">dealing the cards…</p></div>
{:else if phase === 'done'}
	<div class="empty">
		<p class="big">{score}/{rounds.length}</p>
		<p class="muted">
			{score === rounds.length ? 'flawless run 🏆' : score >= rounds.length * 0.7 ? 'sharp 👌' : 'keep at it'}
		</p>
		<p class="trio">words: {trio.map((w) => w.word.trim()).join(' · ')}</p>
		<button class="cta" onclick={start}>Play again</button>
	</div>
{:else if current}
	<section class="card">
		<div class="meta">
			<span class="kind">{KIND_LABEL[current.kind]}</span>
			<span class="prog">{index + 1}/{rounds.length}</span>
			<span class="dot">·</span>
			<span>{score} ✓</span>
			{#if usingSample}<span class="sample">sample data</span>{/if}
		</div>

		<div class="bar"><span class="fill" style:width={`${((index + (answered ? 1 : 0)) / rounds.length) * 100}%`}></span></div>

		{#if current.kind === 'gap'}
			<p class="sentence">
				{parts[0]}<span class="blank" class:right={answered && lastCorrect} class:wrong={answered && !lastCorrect}>
					{#if !answered}<span class="rule"></span>{:else}{current.item.answer}{/if}
				</span>{parts[1]}
			</p>
			{#if answered && !lastCorrect}<p class="correction">answer: <strong>{current.item.headword}</strong></p>{/if}
			<div class="entry">
				<input
					bind:this={input}
					bind:value
					onkeydown={onKey}
					disabled={answered}
					placeholder="the missing word"
					autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="go"
					class:right={answered && lastCorrect} class:wrong={answered && !lastCorrect}
				/>
				{#if !answered}
					<button class="primary" onclick={submitText} disabled={!value.trim()}>Check</button>
				{:else}
					<button class="primary" onclick={next}>{index + 1 >= rounds.length ? 'Finish' : 'Next'}</button>
				{/if}
			</div>
		{:else if current.kind === 'gapselect'}
			<p class="sentence">
				{parts[0]}<span class="blank" class:right={answered && lastCorrect} class:wrong={answered && !lastCorrect}>
					{#if !answered}<span class="rule"></span>{:else}{current.item.answer}{/if}
				</span>{parts[1]}
			</p>
			<div class="options">
				{#each current.options as o, i}
					<button
						class="option"
						class:correct={answered && o.correct}
						class:wrong={picked === i && !o.correct}
						disabled={answered}
						onclick={() => choose(i)}
					>
						<span class="letter">{String.fromCharCode(97 + i)}</span>
						<span class="text">{o.text}</span>
					</button>
				{/each}
			</div>
			{#if answered}
				<button class="primary" onclick={next}>{index + 1 >= rounds.length ? 'Finish' : 'Next'}</button>
			{/if}
		{:else if current.kind === 'recall'}
			<p class="lead">which word means…</p>
			<p class="clue">{current.clue}</p>
			{#if answered}<p class="answer {lastCorrect ? 'right' : 'wrong'}">{current.word.word.trim()}</p>{/if}
			<div class="entry">
				<input
					bind:this={input}
					bind:value
					onkeydown={onKey}
					disabled={answered}
					placeholder="the word"
					autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="go"
					class:right={answered && lastCorrect} class:wrong={answered && !lastCorrect}
				/>
				{#if !answered}
					<button class="primary" onclick={submitText} disabled={!value.trim()}>Check</button>
				{:else}
					<button class="primary" onclick={next}>{index + 1 >= rounds.length ? 'Finish' : 'Next'}</button>
				{/if}
			</div>
		{:else}
			<p class="prompt">
				{#if current.kind === 'choice'}what does <strong>{current.word.word.trim()}</strong> mean?
				{:else}which word means the same as <strong>{current.word.word.trim()}</strong>?{/if}
			</p>
			<div class="options">
				{#each current.options as o, i}
					<button
						class="option"
						class:correct={answered && o.correct}
						class:wrong={picked === i && !o.correct}
						disabled={answered}
						onclick={() => choose(i)}
					>
						<span class="letter">{String.fromCharCode(97 + i)}</span>
						<span class="text">{o.text}</span>
					</button>
				{/each}
			</div>
			{#if answered}
				<button class="primary" onclick={next}>{index + 1 >= rounds.length ? 'Finish' : 'Next'}</button>
			{/if}
		{/if}

		{#if answered && ttsReady()}
			<button class="hear" onclick={() => speak(answerWord())}>🔊 hear it</button>
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
	.kind {
		text-transform: uppercase;
		letter-spacing: 0.07em;
		font-size: 11px;
		color: var(--ink);
	}
	.prog {
		margin-left: auto;
	}
	.dot {
		opacity: 0.5;
	}
	.sample {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border: 1px solid var(--line);
		padding: 2px 7px;
		border-radius: 999px;
	}
	.bar {
		height: 4px;
		border-radius: 999px;
		background: var(--line);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--ink);
		transition: width 0.25s ease;
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
		align-self: flex-start;
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
	.hear {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 15px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--panel);
		font-size: 14px;
	}
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
	}
	.empty .big {
		font-family: var(--serif);
		font-size: 30px;
		margin: 0;
	}
	.trio {
		font-size: 14px;
		color: var(--muted);
		margin: 0;
	}
	.rounds {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	.rlabel {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	.rchips {
		display: flex;
		gap: 8px;
	}
	.rchip {
		min-width: 44px;
		padding: 9px 0;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--panel);
		color: var(--ink);
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}
	.rchip.on {
		border-color: var(--ink);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		font-weight: 600;
	}
	.cta {
		margin-top: 8px;
		padding: 13px 28px;
		border-radius: 14px;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
	}
	.muted {
		color: var(--muted);
		margin: 0;
	}
</style>
