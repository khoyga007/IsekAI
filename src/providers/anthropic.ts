import { smartFetch } from "./fetch";
import type { Provider, ProviderConfig, ChatRequest, ChatChunk } from "./types";
import { ProviderError } from "./types";
import { parseSSE } from "./sse";

const DEFAULT_BASE = "https://api.anthropic.com";

export const anthropic: Provider = {
  id: "anthropic",
  label: "Anthropic Claude",
  needsKey: true,
  defaultModels: [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", context: 200000, hint: "Most capable" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", context: 200000, hint: "Balanced" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", context: 200000, hint: "Fast & cheap" },
  ],

  async *stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<ChatChunk> {
    if (!cfg.apiKey) throw new ProviderError("anthropic", null, "Missing API key");

    // Anthropic supports up to 4 cache breakpoints per request, set via
    // `cache_control: { type: "ephemeral" }` on a content block. Tokens BEFORE
    // each breakpoint get cached together; subsequent requests hit the cache
    // up to the longest matching breakpoint chain.
    //
    // Our typical layout uses 2 breakpoints:
    //   1. stable system block (rules + bible + protagonist)         <- cache hit on every turn
    //   2. last historical assistant turn                              <- rolls forward each turn
    // Plus a non-cached dynamic system block + new user msg afterward.
    //
    // Both system messages and user/assistant messages must use the array
    // content form to carry cache_control. Plain strings work for non-cached.
    //
    // Only the LEADING system messages are hoisted into the `system` param.
    // Hoisting every system message would silently reorder the prompt: the
    // volatile dynamic block (HUD/crystals, emitted AFTER history) would land
    // between the stable block and history in the real prefix, so the history
    // breakpoint missed whenever HUD changed (1.25x write instead of 0.1x
    // read). Mid-conversation system messages are folded into the next user
    // message instead, preserving the true prefix order.
    const sysMsgs: typeof req.messages = [];
    let lead = 0;
    while (lead < req.messages.length && req.messages[lead].role === "system") {
      sysMsgs.push(req.messages[lead++]);
    }
    const systemBlocks = sysMsgs.map((m) => {
      const block: Record<string, unknown> = { type: "text", text: m.content };
      if (m.cache) block.cache_control = { type: "ephemeral" };
      return block;
    });
    const system = systemBlocks.length === 0
      ? undefined
      : systemBlocks.length === 1 && !sysMsgs[0].cache
        ? sysMsgs[0].content                  // legacy plain string when no caching needed
        : systemBlocks;

    const messages: { role: string; content: unknown }[] = [];
    let pendingSys: string[] = [];
    for (const m of req.messages.slice(lead)) {
      if (m.role === "system") { pendingSys.push(m.content); continue; }
      let content = m.content;
      if (m.role === "user" && pendingSys.length > 0) {
        content = `${pendingSys.join("\n\n")}\n\n${content}`;
        pendingSys = [];
      }
      if (m.cache) {
        messages.push({
          role: m.role,
          content: [
            { type: "text", text: content, cache_control: { type: "ephemeral" } },
          ],
        });
      } else {
        messages.push({ role: m.role, content });
      }
    }
    // Trailing system message with no user after it — shouldn't happen in
    // the play flow, but don't silently drop content if a caller does it.
    if (pendingSys.length > 0) {
      messages.push({ role: "user", content: pendingSys.join("\n\n") });
    }

    const url = `${cfg.baseUrl ?? DEFAULT_BASE}/v1/messages`;
    const res = await smartFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        // Required when calling the API from a browser/webview context;
        // without it Anthropic rejects CORS requests with 401.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: req.model,
        system,
        messages,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        stream: true,
        ...(req.extra ?? {}),
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      throw new ProviderError("anthropic", res.status, await res.text());
    }

    let inTok = 0, outTok = 0, cachedTok = 0;
    for await (const data of parseSSE(res, req.signal)) {
      if (data === "[DONE]") break;
      let evt: any;
      try { evt = JSON.parse(data); } catch { continue; }
      const type = evt.type;
      if (type === "content_block_delta" && evt.delta?.type === "text_delta") {
        yield { delta: evt.delta.text };
      } else if (type === "message_start" && evt.message?.usage) {
        const u = evt.message.usage;
        // Anthropic splits input into 3 fields:
        //   input_tokens                   = fresh input
        //   cache_creation_input_tokens    = tokens written to cache (one-time)
        //   cache_read_input_tokens        = tokens read from cache (90% off)
        // We report total = sum, and cachedTokens = the read portion.
        inTok = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        cachedTok = u.cache_read_input_tokens ?? 0;
      } else if (type === "message_delta" && evt.usage) {
        outTok = evt.usage.output_tokens ?? outTok;
      } else if (type === "message_stop") {
        yield { delta: "", done: true, usage: { inputTokens: inTok, outputTokens: outTok, cachedTokens: cachedTok } };
      }
    }
  },
};
