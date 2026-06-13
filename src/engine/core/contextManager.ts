import { streamWithActive } from "../chat";
import type { Campaign } from "@/state/types";
import { buildSystemPrompt } from "./promptBuilder";
import { formatInput, panelsToCompact } from "./streamParser";

/* ---------- Context window management ---------- */

/** Rough token estimator: ~4 chars per token (good enough for gating). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * If the total prompt would exceed TOKEN_BUDGET, summarize the oldest
 * COMPRESS_CHUNK scenes into one crystal and drop them from context.
 * Returns the (possibly shortened) copy of the campaign to use for this turn.
 */
export async function compressIfNeeded(c: Campaign): Promise<Campaign> {
  const TOKEN_BUDGET = 5500;   // leave ~2500 headroom for response
  const COMPRESS_CHUNK = 8;    // how many old scenes to collapse at once

  const sys = buildSystemPrompt(c);
  const historyText = (c.scenes ?? []).flatMap(s => [
    s.playerInput ? formatInput(s.playerInput) : "",
    panelsToCompact(s.panels),
  ]).join(" ");

  const total = estimateTokens(sys) + estimateTokens(historyText);
  if (total <= TOKEN_BUDGET || (c.scenes ?? []).length < COMPRESS_CHUNK + 2) return c;

  // Summarize the oldest COMPRESS_CHUNK scenes.
  const toCompress = (c.scenes ?? []).slice(0, COMPRESS_CHUNK);
  const summaryPrompt = [
    "Summarize the following roleplay scenes in 3-5 sentences. Focus on plot events, character decisions, and HUD-relevant changes. Be terse.",
    "",
    ...toCompress.map((s, i) => {
      const inp = s.playerInput ? `[Player: ${formatInput(s.playerInput)}]` : "";
      const story = panelsToCompact(s.panels).slice(0, 600);
      return `Turn ${i}: ${inp}\n${story}`;
    }),
  ].join("\n");

  let summary = "";
  try {
    await streamWithActive({
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.3,
      maxTokens: 300,
      onChunk: (d) => { summary += d; },
    });
  } catch {
    // If summarization fails, just drop old scenes silently.
    summary = `(Scenes ${toCompress[0].turn}–${toCompress[toCompress.length - 1].turn} summarized — summary unavailable.)`;
  }

  // Pin the summary as a crystal and drop the compressed scenes.
  const newCrystal = {
    id: `ctx-${Date.now()}`,
    turn: toCompress[toCompress.length - 1].turn,
    title: `Context Summary (T${toCompress[0].turn}–T${toCompress[toCompress.length - 1].turn})`,
    summary: summary.trim(),
  };

  return {
    ...c,
    scenes: (c.scenes ?? []).slice(COMPRESS_CHUNK),
    crystals: [...(c.crystals ?? []), newCrystal],
  };
}


