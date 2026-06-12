/**
 * Sequel ("Part 2") engine — when a campaign has grown long but the story
 * isn't done, condense everything that happened into a recap and start a
 * fresh campaign that carries the world bible, HUD state, and cast with a
 * clean context window.
 *
 * The recap is generated once, shown to the player for editing, then stored
 * on the new campaign and injected into the stable (cached) system prompt.
 */
import { streamWithActive } from "./chat";
import { panelsToCompact, formatInput } from "./storyEngine";
import { useSettings } from "@/state/settings";
import type { Campaign } from "@/state/types";

const RECAP_SYS = `You are a story archivist. You will receive the full record of one part of an interactive roleplay campaign: memory crystals (pinned key events) and the scene log. Write a RECAP that lets a new Game Master continue the story seamlessly in Part 2 without reading the original.

Cover, in this order:
1. STORY SO FAR — the major arcs in chronological order: what happened, what the protagonist did, what changed in the world. Be concrete (names, places, outcomes).
2. CHARACTERS — every NPC who matters: alive or dead, where they are now, their current relationship/attitude toward the protagonist (including romance progress), what they want.
3. PROTAGONIST STATE — growth, new abilities, reputation, key possessions, injuries or curses still in effect.
4. UNRESOLVED THREADS — promises not yet kept, mysteries not yet solved, enemies still at large, debts owed.
5. WHERE WE LEFT OFF — the exact final situation: place, time, who is present, what is about to happen (the cliffhanger if any).

Rules:
- Plain text with the 5 numbered section headers above. No markdown, no commentary about the recap itself.
- 400-700 words. Dense and factual beats lyrical.
- State facts as established canon ("X is dead", "Y owes the protagonist a favor") — never hedge.
- Keep proper nouns exactly as they appear in the log.{LANG}`;

function getLangNote(): string {
  const lang = useSettings.getState().ui.lang;
  if (lang === "vi") {
    return "\n\nIMPORTANT: Write the entire recap in Vietnamese (Tiếng Việt), including the 5 section headers. Only keep proper nouns in their original form.";
  }
  return "";
}

/** Cap a scene's compact text so a 100-turn campaign doesn't blow the request. */
const SCENE_CHAR_CAP = 700;
/** How many of the most recent scenes get included verbatim (older ones are
 *  usually already covered by compression crystals). */
const RECENT_SCENES = 30;

function buildRecapUserMsg(c: Campaign): string {
  const crystals = (c.crystals ?? [])
    .map((cr) => `[T${cr.turn}] ${cr.title}: ${cr.summary}`)
    .join("\n");

  const scenes = (c.scenes ?? []).slice(-RECENT_SCENES).map((s) => {
    const inp = s.playerInput ? `[Player: ${formatInput(s.playerInput)}] ` : "";
    return `--- Turn ${s.turn} ---\n${inp}${panelsToCompact(s.panels).slice(0, SCENE_CHAR_CAP)}`;
  }).join("\n");

  return [
    `CAMPAIGN: ${c.bible.title} (${c.bible.genre}, ${c.bible.tone})`,
    `PROTAGONIST: ${c.protagonist.name} — ${c.protagonist.role}`,
    "",
    crystals ? `═══ MEMORY CRYSTALS (key events, oldest first) ═══\n${crystals}` : "",
    "",
    `═══ SCENE LOG (most recent ${Math.min(RECENT_SCENES, c.scenes?.length ?? 0)} turns) ═══\n${scenes}`,
    "",
    "Write the recap now.",
  ].filter(Boolean).join("\n");
}

/**
 * Generate a recap of the campaign so far. Streams partial text through
 * `onChunk` so the UI can fill the textarea live.
 */
export async function generateRecap(
  c: Campaign,
  opts: { signal?: AbortSignal; onChunk?: (full: string) => void } = {},
): Promise<string> {
  let acc = "";
  await streamWithActive({
    messages: [
      { role: "system", content: RECAP_SYS.replace("{LANG}", getLangNote()) },
      { role: "user", content: buildRecapUserMsg(c) },
    ],
    temperature: 0.4,
    maxTokens: 1600,
    signal: opts.signal,
    onChunk: (d) => { acc += d; opts.onChunk?.(acc); },
  });
  const out = acc.trim();
  if (!out) throw new Error("Recap came back empty — retry, or switch to a non-thinking model.");
  return out;
}
