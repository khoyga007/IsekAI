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
 * COMPRESS_CHUNK live scenes into one crystal and mark them archived.
 * Archived scenes stay on disk (readable in StoryView, retrievable later)
 * but are excluded from the model's context — only the crystal remains.
 * Returns the (possibly updated) copy of the campaign to use for this turn.
 */
export async function compressIfNeeded(c: Campaign): Promise<Campaign> {
  // Raised from 5500 (2026-06-13): forgetting started around turn ~15-20,
  // which is where most consistency complaints come from. DeepSeek/OpenAI
  // prefix caching makes the old history cheap (~90% off on cache hits), so
  // a large window costs far less than it looks. 24k leaves plenty of
  // headroom below the 64k-200k contexts of every supported provider.
  const TOKEN_BUDGET = 24000;
  const COMPRESS_CHUNK = 8;    // how many old scenes to collapse at once

  const live = (c.scenes ?? []).filter(s => !s.archived);
  const sys = buildSystemPrompt(c);
  const historyText = live.flatMap(s => [
    s.playerInput ? formatInput(s.playerInput) : "",
    panelsToCompact(s.panels),
  ]).join(" ");

  const total = estimateTokens(sys) + estimateTokens(historyText);
  if (total <= TOKEN_BUDGET || live.length < COMPRESS_CHUNK + 2) return c;

  // Summarize the oldest COMPRESS_CHUNK live scenes.
  const toCompress = live.slice(0, COMPRESS_CHUNK);
  const summaryPrompt = [
    "Summarize the following roleplay scenes in 3-5 sentences. Focus on plot events, character decisions, and HUD-relevant changes. Be terse.",
    "",
    ...toCompress.map((s) => {
      const inp = s.playerInput ? `[Player: ${formatInput(s.playerInput)}]` : "";
      const story = panelsToCompact(s.panels).slice(0, 600);
      return `Turn ${s.turn}: ${inp}\n${story}`;
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

  const compressedIds = new Set(toCompress.map(s => s.id));
  return {
    ...c,
    scenes: (c.scenes ?? []).map(s => compressedIds.has(s.id) ? { ...s, archived: true } : s),
    crystals: [...(c.crystals ?? []), newCrystal],
  };
}


