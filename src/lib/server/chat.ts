// Shared OpenAI-compatible chat call used by the generate / rate / synonyms routes.
// Keeps the latency wins (capped tokens, JSON mode) but degrades gracefully:
// if an endpoint rejects `response_format` (some local models do), it retries once
// without it so existing setups keep working.
import type { AiConfig } from '$lib/types';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

interface Opts {
	temperature?: number;
	maxTokens?: number;
	/** Ask for JSON mode (with automatic fallback if unsupported). */
	json?: boolean;
}

export interface ChatResult {
	ok: boolean;
	status: number;
	content: string;
	detail: string;
}

export async function chat(
	fetchFn: typeof fetch,
	config: AiConfig,
	messages: Msg[],
	opts: Opts = {}
): Promise<ChatResult> {
	const base: Record<string, unknown> = {
		model: config.model,
		temperature: opts.temperature ?? 0.7,
		messages
	};
	if (opts.maxTokens) base.max_tokens = opts.maxTokens;

	const send = (body: Record<string, unknown>) =>
		fetchFn(`${config.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
			body: JSON.stringify(body)
		});

	let res = await send(opts.json ? { ...base, response_format: { type: 'json_object' } } : base);

	// Retry without JSON mode if that's what the endpoint choked on.
	if (!res.ok && res.status === 400 && opts.json) {
		res = await send(base);
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		return { ok: false, status: res.status, content: '', detail };
	}

	const data = await res.json().catch(() => null);
	return { ok: true, status: 200, content: data?.choices?.[0]?.message?.content ?? '', detail: '' };
}
