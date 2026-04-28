import { getProvider, PROVIDERS, ProviderError, type ChatMessage, type ChatUsage, type ProviderId } from "@/providers";
import { useSettings } from "@/state/settings";

export interface StreamOpts {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk?: (delta: string) => void;
  /** Called once on the final chunk if the provider reports usage. */
  onUsage?: (usage: ChatUsage) => void;
  /** Called when the active provider failed and a fallback was used instead. */
  onFallback?: (info: { from: ProviderId; to: ProviderId; error: unknown }) => void;
}

/**
 * If the provider rejects with 402 because the user's wallet can't fund the
 * requested max_tokens (OpenRouter does this), parse the affordable amount
 * from the error message so we can retry with a smaller budget.
 *   "...You requested up to 1500 tokens, but can only afford 1325..."
 */
function parseAffordableTokens(err: unknown): number | null {
  if (!(err instanceof ProviderError) || err.status !== 402) return null;
  const m = err.message.match(/can only afford\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 100 ? n : null;
}

/** Run a single attempt against ONE provider, with the built-in 402-budget retry. */
async function runWithProvider(providerId: ProviderId, opts: StreamOpts): Promise<string> {
  const s = useSettings.getState();
  const provider = getProvider(providerId);
  const cfg = s.providers[providerId];
  if (provider.needsKey && !cfg.apiKey) {
    throw new Error(`No API key set for ${provider.label}. Open Settings → enter your key.`);
  }
  const model = cfg.model ?? provider.defaultModels[0]?.id;
  if (!model) throw new Error(`No model selected for ${provider.label}.`);

  const runOnce = async (maxTokens: number | undefined): Promise<string> => {
    let acc = "";
    for await (const ch of provider.stream(
      {
        model,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens,
        signal: opts.signal,
      },
      { id: provider.id, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl },
    )) {
      if (ch.delta) {
        acc += ch.delta;
        opts.onChunk?.(ch.delta);
      }
      if (ch.usage) opts.onUsage?.(ch.usage);
      if (ch.done) break;
    }
    return acc;
  };

  try {
    return await runOnce(opts.maxTokens);
  } catch (e) {
    const afford = parseAffordableTokens(e);
    // 402 fires before the SSE body, so retrying with a smaller budget
    // doesn't risk duplicating partial output.
    if (afford !== null) {
      const retry = Math.max(256, afford - 50);
      console.warn(`[runWithProvider:${providerId}] 402 affordable=${afford}, retrying with maxTokens=${retry}`);
      return await runOnce(retry);
    }
    throw e;
  }
}

/**
 * Stream a chat completion using the user's currently-active provider.
 * If a fallback provider is configured and the primary fails BEFORE any
 * chunks have streamed, the fallback is tried automatically.
 */
export async function streamWithActive(opts: StreamOpts): Promise<string> {
  const s = useSettings.getState();
  const primary = s.active;
  const fallback = s.fallback;

  // Track whether we've delivered any chunks to the caller. If primary
  // failed mid-stream, a fallback would duplicate output — so only fall
  // back when no chunks were emitted.
  let hasStreamed = false;
  const wrapped: StreamOpts = {
    ...opts,
    onChunk: (delta) => {
      hasStreamed = true;
      opts.onChunk?.(delta);
    },
  };

  try {
    return await runWithProvider(primary, wrapped);
  } catch (e: any) {
    // Don't fall back on user aborts.
    if (e?.name === "AbortError") throw e;
    // Don't fall back if we already showed partial output to the user.
    if (hasStreamed) throw e;
    // Don't fall back if no fallback is set, or it's the same provider.
    if (!fallback || fallback === primary) throw e;
    console.warn(`[streamWithActive] Primary "${primary}" failed: ${e?.message ?? e}. Trying fallback "${fallback}".`);
    opts.onFallback?.({ from: primary, to: fallback, error: e });
    return await runWithProvider(fallback, opts);
  }
}

/** Re-export so UI code can resolve a provider id to its label. */
export function providerLabel(id: ProviderId): string {
  return PROVIDERS[id]?.label ?? id;
}

/** Single-shot completion that asks the model to return JSON only. Retries up to 3 times on parse failure. */
export async function completeJSON<T = unknown>(
  system: string,
  user: string,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const MAX_RETRIES = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    if (attempt > 0) {
      messages.push({
        role: "user",
        content: `Your previous response was NOT valid JSON. Error: ${lastError}. Please try again — return ONLY a valid JSON object, no prose, no markdown fences.`,
      });
    }
    const raw = await streamWithActive({
      messages,
      temperature: opts.temperature ?? 0.6,
      maxTokens: 2048,
      signal: opts.signal,
    });
    try {
      return parseJSON<T>(raw);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[completeJSON] attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError);
      if (attempt === MAX_RETRIES - 1) throw e;
    }
  }
  throw new Error("completeJSON: exhausted retries");
}

/** Forgiving JSON parser — strips fences, trailing prose, and sanitizes common model quirks. */
export function parseJSON<T = unknown>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[\{]/);
  if (start >= 0) s = s.slice(start);
  s = trimToBalanced(s);
  s = sanitizeJSON(s);
  return JSON.parse(s) as T;
}

function sanitizeJSON(s: string): string {
  s = s.replace(/\/\/[^\n"]*\n/g, "\n");
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');
  s = s.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  s = s.replace(/(["}\]])\s*\n\s*"/g, '$1,\n"');
  s = autoCloseJSON(s);
  return s;
}

function autoCloseJSON(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) s += '"';
  s += stack.reverse().join("");
  return s;
}

function trimToBalanced(s: string): string {
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  const open = s[0];
  if (open !== "{" && open !== "[") return s;
  const close = open === "{" ? "}" : "]";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return end >= 0 ? s.slice(0, end + 1) : s;
}
