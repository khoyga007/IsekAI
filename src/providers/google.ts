import { smartFetch } from "./fetch";
import type { Provider, ProviderConfig, ChatRequest, ChatChunk } from "./types";
import { ProviderError } from "./types";
import { parseSSE } from "./sse";

// Must use v1beta — the stable v1 endpoint does NOT support `systemInstruction`.
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const google: Provider = {
  id: "google",
  label: "Google Gemini",
  needsKey: true,
  defaultModels: [
    { id: "gemini-2.5-pro",       label: "Gemini 2.5 Pro",       context: 2_000_000, hint: "Most capable" },
    { id: "gemini-2.5-flash",     label: "Gemini 2.5 Flash",     context: 1_000_000, hint: "Fast" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", context: 1_000_000, hint: "Ultra cheap" },
    { id: "gemini-2.0-flash",     label: "Gemini 2.0 Flash",     context: 1_000_000, hint: "Stable" },
    { id: "gemini-1.5-flash",     label: "Gemini 1.5 Flash",     context: 1_000_000, hint: "Legacy" },
  ],

  async *stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<ChatChunk> {
    if (!cfg.apiKey) throw new ProviderError("google", null, "Missing API key");

    // Gemini 2.0+ has IMPLICIT prompt caching — same `systemInstruction` +
    // identical leading `contents` across requests automatically hits cache.
    // To keep systemInstruction byte-stable, we ONLY put the cache-flagged
    // (stable) system messages there. Volatile system messages (e.g. current
    // HUD state, pacing nudge) get injected as a synthetic user "context"
    // turn just before the latest user message — that way they sit AFTER the
    // cached history and don't poison the systemInstruction.
    const sysMsgs = req.messages.filter((m) => m.role === "system");
    const cachedSys = sysMsgs.filter((m) => m.cache).map((m) => m.content).join("\n\n");
    const volatileSys = sysMsgs.filter((m) => !m.cache).map((m) => m.content).join("\n\n");

    const nonSys = req.messages.filter((m) => m.role !== "system");
    const contents = nonSys.map((m, i) => {
      // Prepend volatile system text into the LAST user message (right before
      // it gets sent to the model). This keeps prior turns identical for
      // implicit caching while still grounding the model in current state.
      const isLast = i === nonSys.length - 1;
      const prefix = isLast && volatileSys ? `[GM CONTEXT — current state]\n${volatileSys}\n[/GM CONTEXT]\n\n` : "";
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: prefix + m.content }],
      };
    });
    // Fallback: if there were no non-system messages at all (rare) but we
    // had volatile system content, append it as a standalone user turn.
    if (contents.length === 0 && volatileSys) {
      contents.push({ role: "user", parts: [{ text: volatileSys }] });
    }
    const sys = cachedSys || volatileSys;  // when no cache flag, treat all as system

    const base = cfg.baseUrl?.replace(/\/$/, "") ?? BASE;
    const url = `${base}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse&key=${cfg.apiKey}`;

    const res = await smartFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
        },
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      const raw = await res.text();
      let msg = raw;
      try {
        const parsed = JSON.parse(raw);
        const e = parsed?.error;
        if (e) msg = `[${e.status ?? res.status}] ${e.message ?? raw}`;
      } catch { /* keep raw */ }
      throw new ProviderError("google", res.status, msg);
    }

    for await (const data of parseSSE(res, req.signal)) {
      let evt: any;
      try { evt = JSON.parse(data); } catch { continue; }
      const text =
        evt.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join("") ?? "";
      if (text) yield { delta: text };
      const finish = evt.candidates?.[0]?.finishReason;
      if (finish) {
        yield {
          delta: "",
          done: true,
          usage: evt.usageMetadata
            ? {
                inputTokens: evt.usageMetadata.promptTokenCount,
                outputTokens: evt.usageMetadata.candidatesTokenCount,
                // Gemini implicit cache hit count (subset of promptTokenCount).
                cachedTokens: evt.usageMetadata.cachedContentTokenCount,
              }
            : undefined,
        };
      }
    }
  },
};
