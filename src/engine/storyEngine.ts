import { streamWithActive } from "./chat";
import type { Campaign, Scene } from "@/state/types";
import { parseStory, type ParsedDoc } from "./core/streamParser";
import { buildSystemPromptStable, buildSystemPromptDynamic } from "./core/promptBuilder";
import { compressIfNeeded } from "./core/contextManager";
import { formatInput, panelsToCompact } from "./core/streamParser";
import { recallArchivedScenes, formatRecalledScenes } from "./core/retrieval";

/* ---------- Stream wrapper ---------- */

export interface PlayTurnArgs {
  campaign: Campaign;
  input: { mode: "say" | "do" | "think" | "ooc"; text: string } | null; // null = opening scene
  signal?: AbortSignal;
  onDelta?: (raw: string) => void;
}

/** Runs one turn end-to-end: builds prompt, streams, returns the final raw + parsed doc. */
export async function playTurn(args: PlayTurnArgs): Promise<{ raw: string; parsed: ParsedDoc }> {
  // Compress old scenes into crystals if context window is getting full.
  const c = await compressIfNeeded(args.campaign);
  // If compression happened, persist the new crystal(s) to the store.
  if (c !== args.campaign) {
    const { useCampaign } = await import("@/state/campaign");
    const cur = useCampaign.getState().current;
    if (cur && cur.id === args.campaign.id) {
      useCampaign.setState({
        current: { ...cur, scenes: c.scenes, crystals: c.crystals },
      });
      void useCampaign.getState().saveCurrent();
    }
  }

  const stable = buildSystemPromptStable(c);
  // RAG over archived scenes: query = player input + the latest live scene
  // (covers "the NPC from the current conversation" even when the player's
  // own text doesn't name them).
  const liveScenes = (c.scenes ?? []).filter((s: Scene) => !s.archived);
  const lastLive = liveScenes[liveScenes.length - 1];
  const queryText = [
    args.input?.text ?? "",
    lastLive ? panelsToCompact(lastLive.panels) : "",
  ].join(" ");
  const recalled = recallArchivedScenes(c, queryText);
  const dynamic = buildSystemPromptDynamic(c, formatRecalledScenes(recalled));
  // Archived scenes live on disk for the reader, not for the model — the
  // crystal summary represents them in the dynamic block instead.
  const history = (c.scenes ?? []).filter((s: Scene) => !s.archived).flatMap((s: Scene) => {
    const out: { role: "user" | "assistant"; content: string; cache?: boolean }[] = [];
    if (s.playerInput) out.push({ role: "user", content: formatInput(s.playerInput) });
    out.push({ role: "assistant", content: panelsToCompact(s.panels) });
    return out;
  });
  // Mark the last historical assistant turn as a cache breakpoint. Combined
  // with the stable-system breakpoint, this lets Anthropic cache up through
  // the most recent committed turn (and lets auto-prefix cachers cache the
  // entire conversation prefix).
  if (history.length > 0) {
    history[history.length - 1] = { ...history[history.length - 1], cache: true };
  }

  const userMsg = args.input
    ? formatInput(args.input)
    : (c.scenes ?? []).length === 0 && c.recap?.trim()
      ? `[CONTINUATION OPENING — this is Part ${c.part ?? 2}, not a new story.]
The previous part has been condensed into the recap in the system prompt. Continue from it.

Structure this first Part ${c.part ?? 2} turn in this order, using the panel tags:

1. <system> — ONE short paragraph (2-4 sentences) saying where Part ${(c.part ?? 2) - 1} left off, how much time has passed if any, and what pressure now hangs over the protagonist. Do NOT summarize the whole recap.

2. <narrate> — re-ground the exact present scene: place, time, who is present, sensory details, and the protagonist's immediate position.

3. <narrate> or <think speaker="${c.protagonist.name}"> — show what the protagonist is carrying forward emotionally or practically from Part ${(c.part ?? 2) - 1}: a promise, injury, relationship, clue, debt, or changed reputation.

4. A forward-moving beat — a consequence arrives, an unresolved thread escalates, someone acts on their agenda, or a new arc opens from established canon. Do NOT undo previous outcomes. Do NOT re-introduce known characters as strangers.

5. End with the usual <scene mood="..." beat="..."/> + 3 <suggest> chips.

Keep it ~5-7 panels. The player should feel "we are back exactly where we left off, and the next arc is moving now."`
    : (c.scenes ?? []).length === 0
      ? `[OPENING TURN — write a proper prologue, do NOT dump the player straight into action.]
This is the very first turn. The player has no idea where they are, what's happening in this world right now, or why their character is in this situation. Your job is to ORIENT them before anything happens.

Structure the opening in this order, using the panel tags:

1. <system> — ONE short paragraph (2-4 sentences) establishing the WORLD'S CURRENT STATE: what era, what's the central tension or status quo, what just happened recently in the world that matters. Think of it as the cold open of a novel's first chapter, or a manga's opening narration box. Pick the 1-2 most important rules from the World Bible that the player MUST know to understand the story (e.g. "vampires rule the surface; humans are livestock", "magic costs lifespan", "the empire fell three years ago"). Do NOT info-dump every faction and rule — just enough that the rest makes sense.

2. <narrate> — set the SCENE: where exactly is the protagonist right now (specific place, time of day, weather, sensory details), and what are they DOING in this moment. Ground us in their body and surroundings.

3. <narrate> or <think speaker="${c.protagonist.name}"> — a glimpse of the protagonist's INTERNAL situation: what they were just thinking about, what they want or fear right now, what their immediate problem is. Anchor us in their POV.

4. A small INCITING beat — something happens (a sound, an arrival, a memory, a notification, an order, a tremor, a stranger appears, a clock ticks). Just a nudge that gives the player something concrete to react to. Do NOT resolve it — leave it dangling.

5. End with the usual <scene mood="..." beat="..."/> + 3 <suggest> chips.

Keep the whole opening ~5-7 panels. Atmospheric, not exposition-heavy. Show the world through one specific moment, not a Wikipedia summary. The player should finish reading and feel "okay, I know where I am and what's at stake — now what do I do?"`
      : "[ADVANCE] The protagonist takes no new action this turn. Advance the story naturally — let time pass, NPCs act on their own lives and goals, the world responds to recent events. Pick a fitting beat (downtime, banter, sidequest, introspection, worldbuilding all welcome unless mid-action). Keep it short and grounded; do NOT invent player decisions.";

  // Message order is critical for caching:
  //   [system: stable, cache:true]   → cached forever (until campaign edit)
  //   [...history, last cache:true]  → progressively cached across turns
  //   [system: dynamic]              → only sent if non-empty; comes AFTER
  //                                    history so its volatility doesn't break
  //                                    the cacheable prefix.
  //   [user: latest input]
  // This unlocks ~95% cache hit rate on long campaigns vs. ~7% before.
  const messages: { role: "system" | "user" | "assistant"; content: string; cache?: boolean }[] = [
    { role: "system", content: stable, cache: true },
    ...history,
  ];
  if (dynamic) messages.push({ role: "system", content: dynamic });
  messages.push({ role: "user", content: userMsg });

  let acc = "";
  await streamWithActive({
    messages,
    temperature: 0.85,
    // Generous cap: thinking models (DeepSeek V4 Flash default mode) count
    // their CoT against max_tokens. 1200 used to get eaten entirely by
    // reasoning on long contexts, leaving zero story text. The prompt keeps
    // scenes short, so non-thinking models won't actually use this headroom.
    maxTokens: 4096,
    signal: args.signal,
    onChunk: (d) => { acc += d; args.onDelta?.(acc); },
    onUsage: async (u) => {
      // Push usage into campaign store so the UI can display it.
      const { useCampaign } = await import("@/state/campaign");
      useCampaign.getState().setLastUsage(u);
    },
    onFallback: async (info) => {
      // Show transient toast when primary failed and fallback was tried.
      const { useCampaign } = await import("@/state/campaign");
      useCampaign.getState().setLastFallback({ from: info.from, to: info.to });
    },
  });

  // An empty result must surface as an error, not silently commit an empty
  // scene into history (which poisons every later turn's context).
  if (!acc.trim()) {
    throw new Error(
      "Model returned no story text. If you're using a thinking model (e.g. deepseek-v4-flash), its reasoning may have consumed the whole token budget — retry, or switch to a non-thinking model like deepseek-chat.",
    );
  }

  return { raw: acc, parsed: parseStory(acc) };
}

// Re-export everything so other files don't break
export * from "./core/promptBuilder";
export * from "./core/streamParser";
export * from "./core/contextManager";
