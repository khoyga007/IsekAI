/**
 * Shared OpenAI-compatible streaming impl, used by:
 *  - openai
 *  - openrouter
 *  - deepseek
 *  - 9router
 * (Anything that speaks the /v1/chat/completions SSE schema.)
 */
import { smartFetch } from "./fetch";
import type { ChatRequest, ChatChunk, ProviderConfig, ProviderId } from "./types";
import { ProviderError } from "./types";
import { parseSSE } from "./sse";

export async function* openAICompatStream(
  providerId: ProviderId,
  baseUrl: string,
  req: ChatRequest,
  cfg: ProviderConfig,
  extraHeaders: Record<string, string> = {},
): AsyncGenerator<ChatChunk> {
  const url = `${cfg.baseUrl ?? baseUrl}/chat/completions`;

  // OpenRouter passes Anthropic's cache_control through to Claude models when
  // content is an array of blocks. For OpenAI / DeepSeek the prefix is
  // auto-cached server-side, so we strip the annotation and use plain strings.
  const wantCache = providerId === "openrouter";
  const messages = req.messages.map((m) => {
    if (wantCache && m.cache) {
      return {
        role: m.role,
        content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
      };
    }
    return { role: m.role, content: m.content };
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extraHeaders,
  };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;

  const res = await smartFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: req.model,
      messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: true,
      // OpenAI-spec quirk: usage is OMITTED from streamed responses unless
      // we explicitly opt in. Without this, chip shows zero for openai /
      // openrouter / deepseek / etc.
      stream_options: { include_usage: true },
      ...(req.extra ?? {}),
    }),
    signal: req.signal,
  });

  if (!res.ok) {
    throw new ProviderError(providerId, res.status, await res.text());
  }

  // With stream_options.include_usage, OpenAI sends usage in a SEPARATE
  // chunk AFTER the one carrying finish_reason (that final chunk has
  // `choices: []` and only the usage block). So we must NOT emit `done`
  // on finish_reason — instead, accumulate usage and emit done at the
  // end of the stream.
  let lastUsage: any = null;
  for await (const data of parseSSE(res, req.signal)) {
    if (data === "[DONE]") break;
    let evt: any;
    try { evt = JSON.parse(data); } catch { continue; }
    if (evt.usage) lastUsage = evt.usage;
    const choice = evt.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta.length) {
      yield { delta };
    }
  }
  yield {
    delta: "",
    done: true,
    usage: lastUsage
      ? {
          inputTokens: lastUsage.prompt_tokens,
          outputTokens: lastUsage.completion_tokens,
          // OpenAI-compat exposes cached subset under prompt_tokens_details.
          // OpenRouter / DeepSeek follow the same shape; for OpenRouter
          // Anthropic routes, cache_read_input_tokens is also forwarded.
          cachedTokens: lastUsage.prompt_tokens_details?.cached_tokens
            ?? lastUsage.cache_read_input_tokens
            ?? lastUsage.prompt_cache_hit_tokens,
        }
      : undefined,
  };
}
