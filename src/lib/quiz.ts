import type { QuizItem } from './types';

/** Pick the next item, weighting weakly-remembered words higher and
 * avoiding an immediate repeat of the same word when possible. */
export function pickNext(items: QuizItem[], lastId?: number): QuizItem | null {
	if (items.length === 0) return null;
	if (items.length === 1) return items[0];

	const pool = items.filter((i) => i.id !== lastId);
	const arr = pool.length ? pool : items;

	const weights = arr.map((i) => 1 / (1 + Math.max(0, i.recollection)));
	const total = weights.reduce((a, b) => a + b, 0);

	let r = Math.random() * total;
	for (let k = 0; k < arr.length; k++) {
		r -= weights[k];
		if (r <= 0) return arr[k];
	}
	return arr[arr.length - 1];
}
