import type { Campaign, Panel, PanelKind } from "@/state/types";

/* ---------- Streaming parser ---------- */

const TAG_RE = /<(\/?)(narrate|act|say|think|system|hud|crystal|suggest|scene|bible-add)([^>]*)(\/?)>/gi;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

export interface BibleAddOp {
  type: "character" | "faction" | "rule";
  name: string;
  desc: string;
}

export interface ParsedDoc {
  panels: Panel[];
  hudOps: HudOp[];
  crystals: { title: string; summary: string }[];
  bibleAdds: BibleAddOp[];
  suggestions: string[];
  mood?: string;
  beat?: string;
}

export type HudOp =
  | { op: "set" | "delta"; id: string; value: string }
  | { op: "tag-add" | "tag-remove"; id: string; value: string }
  | { op: "affinity"; id: string; name: string; value: string }
  | { op: "item-add"; id: string; name: string; qty?: number }
  | { op: "item-remove"; id: string; name: string };

/**
 * If the model ignores the XML instructions and spits out the compact history
 * format (e.g. Gemini 3.1 Pro sometimes does this), we proactively heal it
 * back into XML tags so the parser can handle it properly.
 */
function healCompactFormat(raw: string): string {
  if (/<(narrate|act|say|think|system)[\s>]/i.test(raw)) return raw;
  let out = raw;
  out = out.replace(/\[([^\]]+)\]/g, "<act>$1</act>");
  out = out.replace(/([^\.\!\?\n:]{2,50}):\s*"{1,2}(.*?)"{1,2}/g, (_, speaker, text) => `<say speaker="${speaker.trim()}">${text.trim()}</say>`);
  out = out.replace(/\(([^\.\!\?\n:]{2,50}):\s*([^)]+?)\)/g, (_, speaker, text) => `<think speaker="${speaker.trim()}">${text.trim()}</think>`);
  out = out.replace(/~\s*([^~]+?)\s*~/g, "<system>$1</system>");

  // Heal split dialogue: <say speaker="X">...</say> — action — "more dialogue"
  let prevOut = "";
  while (out !== prevOut) {
    prevOut = out;
    out = out.replace(/(<say speaker="([^"]+)">.*?<\/say>)\s*([—\-].*?[—\-])\s*"{1,2}(.*?)"{1,2}/g, 
      (_, prevSay, speaker, action, text) => {
        let cleanAction = action.replace(/^[—\-]\s*/, '').replace(/\s*[—\-]$/, '');
        return `${prevSay} <act>${cleanAction}</act> <say speaker="${speaker}">${text.trim()}</say>`;
      }
    );
  }

  // Heal *thoughts*
  out = out.replace(/\*([^*]+)\*/g, "<think>$1</think>");

  return out;
}

/** Narration longer than this gets split into multiple panels. */
const MAX_PANEL_CHARS = 320;
/** Dialogue / thought / system flow longer naturally — higher threshold. */
const MAX_SPOKEN_CHARS = 400;

/**
 * Push over-long prose as multiple panels, split into manga-sized beats.
 * Used for untagged fallback text and for any single tag the model crammed
 * a wall into. Splits on blank lines first, then breaks any still-long
 * paragraph into groups of ~3 sentences. Speaker (if any) carries over to
 * every chunk — consecutive same-speaker bubbles read like manga.
 */
function pushPanelChunks(panels: Panel[], kind: PanelKind, text: string, speaker?: string) {
  const MAX_CHARS = MAX_PANEL_CHARS;
  const SENTENCES_PER_PANEL = 3;
  const push = (t: string) => panels.push({ kind, ...(speaker ? { speaker } : {}), text: t });
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= MAX_CHARS) {
      push(p);
      continue;
    }
    // Long paragraph: regroup by sentences. Keeps quotes/ellipses intact —
    // split only on sentence-ending punctuation followed by whitespace.
    const sentences = p.split(/(?<=[.!?…])\s+/);
    let buf: string[] = [];
    for (const s of sentences) {
      buf.push(s);
      if (buf.length >= SENTENCES_PER_PANEL || buf.join(" ").length > MAX_CHARS) {
        push(buf.join(" ").trim());
        buf = [];
      }
    }
    if (buf.length) push(buf.join(" ").trim());
  }
}

/**
 * Push a closed tag as panel(s). Prose kinds the model crammed a wall into
 * get split; <act> stays whole (stage directions read as one unit).
 */
function pushPanel(panels: Panel[], tag: string, attrs: Record<string, string>, text: string) {
  const panel = toPanel(tag, attrs, text);
  const limit =
    panel.kind === "narration" ? MAX_PANEL_CHARS
    : panel.kind === "dialogue" || panel.kind === "thought" || panel.kind === "system" ? MAX_SPOKEN_CHARS
    : Infinity;
  if (panel.text.length <= limit) panels.push(panel);
  else pushPanelChunks(panels, panel.kind, panel.text, panel.speaker);
}

/** Parses the entire raw output into structured panels + HUD ops. */
export function parseStory(rawInput: string): ParsedDoc {
  const raw = healCompactFormat(rawInput);
  const panels: Panel[] = [];
  const hudOps: HudOp[] = [];
  const crystals: { title: string; summary: string }[] = [];
  const bibleAdds: BibleAddOp[] = [];
  const suggestions: string[] = [];
  let mood: string | undefined;
  let beat: string | undefined;

  let match: RegExpExecArray | null;
  let cursor = 0;
  const re = new RegExp(TAG_RE.source, "gi");

  type Open = { tag: string; attrs: Record<string, string>; text: string };
  const stack: Open[] = [];

  while ((match = re.exec(raw)) !== null) {
    const [full, slash, tag, attrText, selfClose] = match;
    const isClose = slash === "/";
    const isSelf = selfClose === "/";
    const start = match.index;
    const end = start + full.length;
    const lc = tag.toLowerCase();

    // Accumulate text since last cursor into the top of the stack.
    // Text outside any tag becomes a narration panel — models drifting off
    // the XML format (long context, high temp) must not lose their prose.
    const chunk = raw.slice(cursor, start);
    if (chunk.trim()) {
      if (stack.length > 0) stack[stack.length - 1].text += chunk;
      else pushPanelChunks(panels, "narration", chunk.trim());
    }
    cursor = end;

    if (isSelf || lc === "hud" || lc === "crystal" || lc === "scene" || lc === "bible-add") {
      const attrs = parseAttrs(attrText);
      if (lc === "hud") hudOps.push(toHudOp(attrs));
      else if (lc === "crystal") crystals.push({ title: attrs.title ?? "", summary: attrs.summary ?? "" });
      else if (lc === "bible-add") {
        bibleAdds.push({
          type: (attrs.type as BibleAddOp["type"]) || "character",
          name: attrs.name ?? "",
          desc: attrs.desc ?? ""
        });
      }
      else if (lc === "scene") {
        if (attrs.mood) mood = attrs.mood.toLowerCase();
        if (attrs.beat) beat = attrs.beat.toLowerCase();
      }
      continue;
    }

    if (!isClose) {
      stack.push({ tag: lc, attrs: parseAttrs(attrText), text: "" });
    } else {
      // Find matching opener.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === lc) {
          const open = stack.splice(i, 1)[0];
          const text = open.text.trim();
          if (text) {
            if (open.tag === "suggest") suggestions.push(text);
            else pushPanel(panels, open.tag, open.attrs, text);
          }
          // discard any unclosed inner tags
          stack.length = i;
          break;
        }
      }
    }
  }

  // Flush any unclosed openers (live streaming case).
  // Strip a partial tag still being streamed (e.g. "<narr") so it doesn't
  // flash as visible text mid-stream.
  const trailing = raw.slice(cursor).replace(/<[a-zA-Z/][^>]*$/, "");
  if (trailing.trim()) {
    if (stack.length > 0) stack[stack.length - 1].text += trailing;
    else pushPanelChunks(panels, "narration", trailing.trim());
  }

  for (const open of stack) {
    const text = open.text.trim();
    if (text) {
      if (open.tag === "suggest") suggestions.push(text);
      else pushPanel(panels, open.tag, open.attrs, text);
    }
  }

  return { panels, hudOps, crystals, bibleAdds, suggestions, mood, beat };
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((m = re.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

function toPanel(tag: string, attrs: Record<string, string>, text: string): Panel {
  // <think> without a speaker is almost always misrouted narration: the
  // format mandates speaker="Name" on every thought, and the *italics*
  // heal in healCompactFormat also lands here when models use asterisks
  // for emphasis/action rather than inner monologue. Render as narration
  // instead of an anonymous "thought" bubble.
  if (tag === "think" && !attrs.speaker) {
    return { kind: "narration", speaker: undefined, text };
  }
  const kind: PanelKind =
    tag === "narrate" ? "narration"
    : tag === "act"     ? "action"
    : tag === "say"     ? "dialogue"
    : tag === "think"   ? "thought"
    : "system";
  return { kind, speaker: attrs.speaker, text };
}

function toHudOp(a: Record<string, string>): HudOp {
  const op = (a.op ?? "set") as HudOp["op"];
  if (op === "affinity") return { op, id: a.id, name: a.name, value: a.value };
  if (op === "item-add") return { op, id: a.id, name: a.name, qty: a.qty ? Number(a.qty) : undefined };
  if (op === "item-remove") return { op, id: a.id, name: a.name };
  return { op: op as any, id: a.id, value: a.value };
}


/* ---------- HUD application ---------- */

export function applyHudOps(c: Campaign, ops: HudOp[]): Campaign {
  if (!ops.length) return c;
  const widgets = (c.hud?.widgets ?? []).map(w => {
    let next = w;
    for (const op of ops) {
      if (op.id !== next.id) continue;
      if (op.op === "delta" && next.type === "stat-bar") {
        next = { ...next, value: clamp(next.value + Number(op.value), 0, next.max) };
      } else if (op.op === "set") {
        if (next.type === "stat-bar") next = { ...next, value: clamp(Number(op.value), 0, next.max) };
        else if (next.type === "stat-number") next = { ...next, value: isNaN(Number(op.value)) ? op.value : Number(op.value) };
        else if (next.type === "note") next = { ...next, body: op.value };
      } else if (op.op === "tag-add" && next.type === "tag-list") {
        if (!next.tags.includes(op.value)) next = { ...next, tags: [...next.tags, op.value] };
      } else if (op.op === "tag-remove" && next.type === "tag-list") {
        next = { ...next, tags: next.tags.filter(t => t !== op.value) };
      } else if (op.op === "affinity" && next.type === "affinity") {
        const cur = next.values[op.name] ?? 0;
        const v = op.value.startsWith("+") || op.value.startsWith("-")
          ? cur + Number(op.value)
          : Number(op.value);
        next = { ...next, values: { ...next.values, [op.name]: clamp(v, -100, 100) } };
      } else if (op.op === "item-add" && next.type === "inventory") {
        const idx = next.items.findIndex(i => i.name === op.name);
        if (idx >= 0) {
          const items = [...next.items];
          items[idx] = { ...items[idx], qty: (items[idx].qty ?? 1) + (op.qty ?? 1) };
          next = { ...next, items };
        } else {
          next = { ...next, items: [...next.items, { name: op.name, qty: op.qty ?? 1 }] };
        }
      } else if (op.op === "item-remove" && next.type === "inventory") {
        next = { ...next, items: next.items.filter(i => i.name !== op.name) };
      }
    }
    return next;
  });
  return { ...c, hud: { ...c.hud, widgets } };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));


export function formatInput(i: { mode: "say" | "do" | "think" | "ooc"; text: string }): string {
  switch (i.mode) {
    case "say":   return `[Speech] ${i.text}`;
    case "do":    return `[Action] ${i.text}`;
    case "think": return `[Inner thought] ${i.text}`;
    case "ooc":   return `[OOC — out of character note to GM] ${i.text}`;
  }
}

export function panelsToCompact(panels: Panel[]): string {
  return panels.map(p => {
    switch (p.kind) {
      case "narration": return p.text;
      case "action":    return `[${p.text}]`;
      case "dialogue":  return `${p.speaker ?? "?"}: "${p.text}"`;
      case "thought":   return `(${p.speaker ?? "thought"}: ${p.text})`;
      case "system":    return `~ ${p.text} ~`;
    }
  }).join("\n");
}

/** Tokenized, order-insensitive name match (same approach as the AniList
 *  avatar matcher): "Rinka" matches "Rinka Akatsuki", "Monkey D. Luffy"
 *  matches "Luffy Monkey". Exact-equality matching created duplicate bible
 *  entries whenever the model varied the name form between turns. */
function sameEntity(a: string, b: string): boolean {
  const tok = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  const ta = tok(a), tb = tok(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const sa = new Set(ta), sb = new Set(tb);
  return ta.every(t => sb.has(t)) || tb.every(t => sa.has(t));
}

/** Merge an update into an existing desc. Skips updates already present
 *  (models love re-emitting the same <bible-add> for several turns, and
 *  every desc change invalidates the stable-prompt cache). */
function mergeDesc(old: string, update: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(old).includes(norm(update))) return old;
  return `${old} (Update: ${update})`;
}

export function applyBibleAdds(c: Campaign, ops: BibleAddOp[]): Campaign {
  if (!ops.length) return c;
  const nextBible = { ...c.bible };

  nextBible.keyCharacters = nextBible.keyCharacters ?? [];
  nextBible.factions = nextBible.factions ?? [];
  nextBible.rules = nextBible.rules ?? [];

  for (const op of ops) {
    if (op.type === "character") {
      const idx = nextBible.keyCharacters.findIndex(k => sameEntity(k.name, op.name));
      if (idx === -1) {
        nextBible.keyCharacters = [...nextBible.keyCharacters, { name: op.name, role: "NPC", desc: op.desc }];
      } else {
        const old = nextBible.keyCharacters[idx];
        const merged = mergeDesc(old.desc, op.desc);
        if (merged !== old.desc) {
          nextBible.keyCharacters = [
            ...nextBible.keyCharacters.slice(0, idx),
            { ...old, desc: merged },
            ...nextBible.keyCharacters.slice(idx + 1)
          ];
        }
      }
    } else if (op.type === "faction") {
      const idx = nextBible.factions.findIndex(f => sameEntity(f.name, op.name));
      if (idx === -1) {
        nextBible.factions = [...nextBible.factions, { name: op.name, desc: op.desc }];
      } else {
        const old = nextBible.factions[idx];
        const merged = mergeDesc(old.desc, op.desc);
        if (merged !== old.desc) {
          nextBible.factions = [
            ...nextBible.factions.slice(0, idx),
            { ...old, desc: merged },
            ...nextBible.factions.slice(idx + 1)
          ];
        }
      }
    } else if (op.type === "rule") {
      const entry = `${op.name}: ${op.desc}`;
      if (!nextBible.rules.some(r => r.toLowerCase().trim() === entry.toLowerCase().trim())) {
        nextBible.rules = [...nextBible.rules, entry];
      }
    }
  }

  return { ...c, bible: nextBible };
}
