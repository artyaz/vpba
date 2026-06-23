// Browser-direct Neon access. The connection string lives only in the user's
// browser and goes straight to Neon over HTTPS — it never touches our server.
import { neon } from '@neondatabase/serverless';
import type { WordRow } from './types';

function table(t: string): string {
	return (t || 'words').replace(/[^a-zA-Z0-9_]/g, '') || 'words';
}

export async function getWords(url: string, t = 'words'): Promise<WordRow[]> {
	const sql = neon(url);
	const rows = await sql.query(
		`select id, word, definition, sentence, recollection, created_at
		 from ${table(t)} order by created_at desc`
	);
	return rows as WordRow[];
}

export async function bumpRecollection(url: string, t: string, id: number, delta: number): Promise<void> {
	const sql = neon(url);
	await sql.query(
		`update ${table(t)}
		 set recollection = greatest(0, coalesce(recollection, 0) + $1)
		 where id = $2`,
		[delta, id]
	);
}

export async function insertWord(
	url: string,
	t: string,
	word: string,
	definition: string,
	sentence: string
): Promise<WordRow> {
	const sql = neon(url);
	const rows = await sql.query(
		`insert into ${table(t)} (word, definition, sentence, recollection, created_at)
		 values ($1, $2, $3, 0, now())
		 returning id, word, definition, sentence, recollection, created_at`,
		[word, definition, sentence]
	);
	return rows[0] as WordRow;
}

export async function createTable(url: string, t: string): Promise<void> {
	const sql = neon(url);
	await sql.query(
		`create table if not exists ${table(t)} (
			id serial primary key,
			word text not null,
			definition text,
			sentence text not null,
			recollection integer not null default 0,
			created_at timestamptz not null default now()
		)`
	);
}

export async function testConnection(
	url: string,
	t = 'words'
): Promise<{ ok: boolean; count?: number; error?: string }> {
	try {
		const sql = neon(url);
		const rows = await sql.query(`select count(*)::int as n from ${table(t)}`);
		return { ok: true, count: rows[0]?.n ?? 0 };
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}
