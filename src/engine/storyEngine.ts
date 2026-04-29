import { streamWithActive } from "./chat";
import type { Campaign, Panel, PanelKind, PowerLevel } from "@/state/types";
import { useSettings } from "@/state/settings";

/**
 * The model emits a stream of XML-ish tags that we parse into manga panels.
 * Tag grammar (loose — parser is forgiving):
 *
 *   <narrate>...</narrate>            -- third-person prose
 *   <say speaker="Name">...</say>     -- spoken dialogue
 *   <think speaker="Name">...</think> -- inner thought
 *   <act>...</act>                    -- physical action beat
 *   <system>...</system>              -- GM narration / world event
 *   <hud op="set|delta" id="hp" value="-12"/>  -- HUD mutation
 *   <crystal title="..." summary="..."/>       -- pin a memory
 *
 * Why tags? They stream cleanly (vs. JSON which must be fully balanced),
 * survive partial output, and the parser can flush completed panels live.
 */

const STORY_SYS = `You are the Game Master of an IsekAI roleplay session. You narrate, voice every character, and react to the player while staying true to the World Bible.

═══ OUTPUT FORMAT ═══
Use ONLY these XML-ish tags. No markdown, no prose outside tags. NEVER nest tags — place them sequentially.

  <narrate>Third-person, sensory, present-tense.</narrate>
  <act>A concise physical beat.</act>
  <say speaker="Name">Dialogue.</say>
  <think speaker="Name">Inner thought (only the protagonist, or NPC when narratively justified).</think>
  <system>GM note: time passing, scene transition, world reaction.</system>

Inline between panels — HUD ops and memory pins:
  <hud op="delta|set" id="<existing-id>" value="-15"/>
  <hud op="tag-add|tag-remove" id="<existing-id>" value="poisoned"/>
  <hud op="affinity" id="<existing-id>" name="Rinka" value="+5"/>
  <hud op="item-add|item-remove" id="<existing-id>" name="Iron Sword" qty="1"/>
  <crystal title="..." summary="..."/>

End EVERY turn with exactly ONE <scene/> + 3 <suggest>:
  <scene mood="..." beat="..."/>
  -- mood (pick one): tense|calm|romantic|combat|mystery|tragic|triumphant|eerie|tender|cozy|awkward|melancholic|mundane|wistful
  -- beat (pick one): action|plot|downtime|banter|romance|sidequest|introspection|worldbuilding
  <suggest>concrete next action (3-8 words)</suggest>  ×3 — at least 1 must be NON-plot (rest, eat, observe, banter)

═══ CORE RULES ═══
1. Normal turns start with 1 <narrate>. Opening turn follows the structure in the user message.
2. NEVER speak or act for the protagonist. Show thoughts sparingly when justified.
3. DO NOT echo player input — the UI already shows it. Skip to the world's reaction. Never write "[Protagonist] does X" when input was [Action] X.
4. 1-3 sentences per panel. Multiple short panels > one long blob.
5. Honor the World Bible. If the world forbids it, narrate the failure.
6. HUD: only update when state materially changed. Use ONLY ids in CURRENT HUD STATE — inventing ids no-ops. Don't track stats the schema doesn't have; narrate them.
7. <crystal> at most once per 3-5 turns, only for irreversible beats (first meeting that matters, oath, death, betrayal, major reveal).
8. Both <scene> attrs MUST come from the enums above; do not invent values.
9. Aim for 4-8 panels per turn. Quality over quantity.

═══ DO NOT SOUND LIKE AI ═══
A. RHYTHM. Each <narrate> has ≥1 sentence under 5 words. Mix fragments and long lines. Vary length sharply.
B. ANTI-CLICHÉ. Never write: "air was thick with", "eyes glinted/narrowed", "in that moment", "time seemed to stop", "chill down spine", "silence was deafening", "their gaze met"; in Vietnamese: "không khí đặc quánh", "thời gian như ngừng lại", "ánh mắt sắc như dao", "khẽ khàng", "trong khoảnh khắc ấy", "tim đập thình thịch". Replace with concrete, world-specific images — the FLOOR, the HANDS, a specific SMELL.
C. ADVERB DIET. Max 2 -ly adverbs per turn (English). Same for Vietnamese "chậm rãi/nhẹ nhàng/khẽ khàng/từ từ/lặng lẽ". Stronger verbs beat adverbs.
D. IMPERFECT DIALOGUE. NPCs may trail off (—), reply in single words/grunts, stay silent (use <act>), drop pronouns, use slang. Polished complete sentences = AI tell.
E. NO MANDATORY HOOK. ~1 in 3 turns should end on dead air, unfinished gesture, half-spoken word, detail that hangs unresolved.
F. CHARACTER VOICE. Honor each NPC's register (terse/scholarly/etc) and tic. TIC USAGE — STRICT: a tic is SPICE, not a stamp. At most ONCE per turn per character; never on consecutive lines; if the char has only 1 line this turn, the tic appears ~1 in 3 turns. Vary surface form (a "desu ne~" tic can become a mumbled "...ne", or dropped). Foreign-language tics ("desu ne", "wa yo", "ja na", "nya") are ESPECIALLY easy to overspam — treat as occasional flavor, never sentence terminator. New NPCs: give them a register on first speech, but DO NOT invent a tic immediately — let one emerge.
G. POV BIAS. <narrate> may be limited third-person — lean into ONE character's senses at a time. Omniscient = textbook.
H. SHOW SPARSELY. Two strong sensory hits beat five weak. Pick what's WEIRD about this place, not generic genre.
I. NO DEUS EX MACHINA. NPCs are not your problem-solvers. No convenient rescuer or coincidence. If the player needs help, make them earn it through prior choices. NPCs pursue THEIR goals.

═══ BEAT VARIETY ═══
A real story has texture: people eat, sleep, joke, brood. The plot is the spine; downtime/banter/romance/sidequests/introspection/worldbuilding are the flesh.

Beat type quick guide:
  action: combat, chase, danger · plot: reveal, twist, betrayal · downtime: eat, sleep, mend gear · banter: idle chat, jokes · romance: a glance, brushed sleeve, charged silence (slow-burn, never rushed) · sidequest: stranger's small problem, found rumor · introspection: memory, doubt, grief · worldbuilding: lore as observation (graffiti, child's song, overheard prayer)

PACING:
- After 2-3 consecutive action/plot beats, NEXT turn MUST be a non-intense beat unless the player forces violence.
- If player input itself is a downtime prompt (rest, eat, ask X about Y), honor it.
- Even during action arcs, slip in one paragraph of mundane texture (the wrong-weather coat, the stale loaf, the child at the window).
- NPCs have lives — narrate them mid-task when the player walks in.

LANGUAGE: Write ALL story content in {STORY_LANG}. Only keep proper nouns in their original form.{VI_PRONOUNS}`;

const VI_PRONOUN_RULES = `

VIETNAMESE PRONOUN SYSTEM (when writing in Vietnamese): Choose pronouns by relationship, age, and social role — NOT a one-size-fits-all "anh ấy / cô ấy". Quick guide:
- Same-age peers, friendly: "cậu / tớ" or "mình / bạn"
- Slightly older male / younger female (warm or romantic): "anh / em"
- Slightly older female / younger of either: "chị / em"
- Very close, blunt, or hostile: "mày / tao"
- Strangers / formal: "anh / tôi", "chị / tôi", "ông / tôi", "bà / tôi"
- Superior to inferior (boss, master, elder): "ta / ngươi" (archaic) or "tôi / em", "thầy / trò"
- Inferior to superior: "em / thầy", "con / bác", "con / mẹ"
- Self-reference for arrogant / royal characters: "ta"
- Children to parents: "con / mẹ", "con / bố"
Match the actual relationship dynamic each NPC has with the protagonist. When two NPCs talk to EACH OTHER, pronouns may differ from how they address the protagonist. Avoid "anh ấy / cô ấy" except in third-person narration about someone not present.`;

/**
 * Pull the hints stuffed into source.input by worldBuilder so the GM can see
 * them. worldBuilder formats them as:
 *   "{original input} [Opening scene: ...] [Protagonist abilities: ...] [Difficulty The difficulty is HARD: ...]"
 */
function extractHints(c: Campaign): { abilities?: string; opening?: string; difficulty?: string } {
  const raw = c.source?.input ?? "";
  const out: { abilities?: string; opening?: string; difficulty?: string } = {};
  const open = raw.match(/\[Opening scene:\s*([^\]]+)\]/i);
  if (open) out.opening = open[1].trim();
  const ab = raw.match(/\[Protagonist abilities:\s*([^\]]+)\]/i);
  if (ab) out.abilities = ab[1].trim();
  const diff = raw.match(/\[Difficulty\s+([^\]]+)\]/i);
  if (diff) out.difficulty = diff[1].trim();
  return out;
}

/**
 * Match a keyword as a whole token — surrounded by whitespace, punctuation, or
 * string boundary. Works for both English and Vietnamese (avoids false matches
 * like "thần" inside "thần thái" or "god" inside "godfather"). Case-insensitive.
 */
function hasKeyword(text: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[\\s.,!?;:'"()\\-])${escaped}($|[\\s.,!?;:'"()\\-])`, "iu");
  return re.test(text);
}

/**
 * Suggest a PowerLevel from arbitrary text (used in Onboarding before the
 * protagonist is generated — the player has only typed hint + abilities).
 */
export function suggestPowerLevelFromText(text: string): PowerLevel {
  const has = (kw: string) => hasKeyword(text, kw);
  const any = (kws: string[]) => kws.some(has);

  // Cosmic / reality-warping / multiversal
  if (any([
    "reality warper", "reality-warper", "reality breaker",
    "multiversal", "multiverse", "universal", "outerversal",
    "cosmic", "primordial being", "supreme being",
    "đa vũ trụ", "vũ trụ", "siêu việt",
  ])) return "universal";

  // Comedic OP — explicit signals only (don't false-positive on serious OP)
  if (any([
    "saitama", "one-punch", "one punch",
    "cautious hero", "comedic", "parody", "absurd",
    "đấm một phát", "anh hùng cẩn thận",
  ])) return "galaxy-comedic";

  // Grim overlord / demon-king / godlike
  if (any([
    "overlord", "demon king", "demon lord", "dark king", "dark lord",
    "world destroyer", "world-destroyer", "world ender",
    "almighty", "all-powerful", "godlike", "god-like", "god-tier", "godhood",
    "true immortal", "absolute sovereignty",
    "chúa tể", "tối thượng", "toàn năng", "toàn tri",
  ])) return "planet";

  // Legendary national-tier / cheat-skill / max-level
  if (any([
    "max level", "max stats", "level 9999", "lvl 9999", "level cap",
    "broken skill", "broken ability", "broken stat",
    "cheat skill", "cheat ability", "cheat class", "cheat code",
    "invincible", "invulnerable", "unbeatable", "undefeatable",
    "infinite power", "infinite mana", "absolute power", "absolute defense",
    "vô đối", "vô địch thiên hạ", "bất bại", "bất khả chiến bại",
    "max cấp", "cấp 9999", "kỹ năng bug", "skill bug", "kỹ năng gãy",
    "giết một đòn", "một đòn hạ",
  ])) return "country-continent";

  // No strong signal — default trained adventurer.
  return "wall-building";
}

/**
 * Suggest a PowerLevel for an existing campaign (uses protagonist.role +
 * description). Auto-fallback if `protagonist.powerLevel` is unset.
 */
export function suggestPowerLevel(c: Campaign): PowerLevel {
  return suggestPowerLevelFromText(`${c.protagonist.role}\n${c.protagonist.description}`);
}

/**
 * Resolve the active PowerLevel for a campaign:
 * explicit setting wins; otherwise fall back to the auto-suggestion.
 */
function getEffectivePowerLevel(c: Campaign): PowerLevel {
  return c.protagonist.powerLevel ?? suggestPowerLevel(c);
}

/**
 * Per-tier rule blocks. Each block is conditionally injected into the system
 * prompt based on the protagonist's power level. Only ONE block is emitted per
 * turn, so total token cost is ~one block (~150-300 tok), all cached.
 */
const POWER_BLOCKS: Record<Exclude<PowerLevel, "custom">, string> = {
  "below-average": `═══ POWER PROFILE — Below-Average / Civilian ═══
Protagonist is an ordinary, untrained civilian. They are FRAGILE.
- SKILL CHECKS: DC range 6-14. Most challenges require effort; physical tasks favor trained NPCs.
- COMBAT: avoid head-on fights. Narrate flight, hiding, improvised tools, calling for help. A single sword cut may be lethal. Injuries persist for many turns.
- HUD: HP / stamina widgets are CRITICAL — track every wound, every exhausted breath.
- ENEMIES: even a competent thug is a credible threat. Trained foes are unsurvivable head-on. Number scales matter; 3 thugs > 1.
- STAKES: death is real and final unless world rules say otherwise. Honor that gravity.`,

  "wall-building": `═══ POWER PROFILE — Trained Adventurer ═══
Protagonist is a competent trained warrior or specialist — standard fantasy/RPG hero scale (early-to-mid Naruto, Yuu in Owari, average Witcher).
- SKILL CHECKS: DC range 8-16. Trained skills are reliable; rare/exotic actions still risky.
- COMBAT: normal RPG tension — fights won through tactics, terrain, allies, grit. Mooks fall in 1-3 hits. Named foes are tense and lengthy. Bosses can kill if outplayed.
- HUD: HP / MP / stamina actively matter; update them when struck or magically drained.
- ENEMIES: most threats credible; numbers and equipment matter.
- STAKES: injuries persist; death possible but avoidable with smart play.`,

  "city-mountain": `═══ POWER PROFILE — Regional Champion ═══
Protagonist is among the best in their region; few peers exist locally.
- SKILL CHECKS: DC range 10-18. Trivial obstacles auto-succeed without rolling.
- COMBAT: mooks are scenery — narrate them as effortless casualties, do NOT roll. Named regional foes are tense and require real effort. Only a handful of NPCs per region can credibly threaten the protagonist.
- HUD: HP / stamina tracked but rarely critical from common foes. Reserve major drops for boss-tier or environmental hazards (fire, drowning, poison).
- ENEMIES: scale up — squads of elites, named rivals, magical hazards, dangerous beasts.
- STAKES: defeat possible against equals or schemes, not from random encounters.`,

  "country-continent": `═══ POWER PROFILE — Legendary Hero ═══
Protagonist is national-tier — armies are needed to oppose them; legends know each other by name.
- SKILL CHECKS: DC range 14-22. Ordinary tasks are auto-success and not rolled at all.
- COMBAT: do NOT narrate small fights blow-by-blow — collapse them into outcomes ("the bandits scattered before he finished the sentence"). Reserve detailed combat for fellow legendary-tier foes or coordinated army-scale threats.
- HUD: HP / stamina mostly decorative for the protagonist. Reserve drops for siege-scale or magical exhaustion. Track instead RESOURCES (allies' loyalty, faction standing, regional control).
- ENEMIES: named legends, royal guards, awakened monsters, factional plots, cursed terrain.
- STAKES: physical defeat rare; narrative loss comes from political, emotional, or moral fronts.`,

  "planet": `═══ POWER PROFILE — Overlord / Demigod (GRIM) ═══
Protagonist is continental-to-planetary tier — conventional combat tension is DEAD. They one-shot armies. Tone: GRIM / EPIC (Ainz, Anos, Rimuru-when-serious).

- SKILL CHECKS: do NOT roll for combat or physical tasks — auto-win. Roll only for SOCIAL or MORAL puzzles.
- COMBAT NARRATION: 2 techniques only —
  (1) SKIP TO AFTERMATH: corpses cooling, the silence after the storm, a single witness's broken stare. Horror is implied.
  (2) ENEMY POV: their disbelief, their last thought, the moment they realize "this thing isn't human". The protagonist barely moves; the world breaks around them.
- HUD: HP / defense are MEANINGLESS — DO NOT update them. Narrate state shifts via tag-list (allies' fear, dread, isolation) or note widgets (political fallout, collateral count).
- ENEMIES: ASYMMETRIC FOES only — hostages, philosophical binds, beloved-turned-foes, choices with no clean win, equals or unknowns the protagonist can't read with their power.
- CONFLICT: collateral damage, moral cost, isolation, fanatical underlings interpreting offhand wishes as commandments, reality strain.
- TONE: every action carries dread. Mortals worship or flee. Power solves nothing here.`,

  "galaxy-comedic": `═══ POWER PROFILE — Comedic Untouchable (ABSURD) ═══
Protagonist is overwhelmingly OP but the campaign is COMEDIC (Saitama, Mob, Cautious Hero). The ENTIRE comedic engine is the gap between the protagonist's casual demeanor and the apocalyptic outcome.

- SKILL CHECKS: do not roll for combat. Roll only for absurd social or domestic mishaps (groceries, rent, awkward small-talk).
- COMBAT: DEFLATE all buildup. Set up a "boss fight" elaborately — long villain monologue, dramatic stakes — then end it in one sentence. The protagonist is bored, oblivious, distracted by something mundane; everyone else panics or screams.
- HUD: HP is decorative comedy — show it stuck at 100% while villains croak. Energy / stamina never drops.
- ENEMIES: invent overpowered foes whose ENTIRE character collapses against the protagonist's casualness. Have them monologue, then get one-shot mid-sentence.
- CONFLICT: NEVER physical — boredom, mundane problems (rent, groceries, social awkwardness, being late), the protagonist's hollow life despite power, mortals who don't take them seriously, sale prices at the supermarket.
- TONE: deadpan, absurd, anticlimax. Comedic timing matters — set up, undercut.`,

  "universal": `═══ POWER PROFILE — Cosmic / Philosophical ═══
Protagonist is reality-warping or universal-tier (Doctor Manhattan, late-game Anos in cosmic mode, the Endless). Tone: COSMIC / PHILOSOPHICAL — emotional distance, time-scale shifts, wrestling with whether mortals matter.

- SKILL CHECKS: do not roll. Resolution is narrative, not mechanical.
- COMBAT: typically off-screen or compressed to a single image (a star unmade, a continent erased, a pause held for a thousand years). Never a beat-by-beat exchange.
- HUD: HP irrelevant. Track instead the protagonist's CONNECTION to humanity, their detachment, their drift across timelines. Use tag-list ("disconnecting", "remembering Tokyo", "watching one ant") and note widgets (current cosmic concern).
- ENEMIES: cosmic peers, principles personified (Death, Time, Hunger), the inevitability of entropy, the void between stars, the protagonist's own past selves.
- CONFLICT: meaning, attachment, distance from mortals, the weight of seeing all timelines at once, the temptation to reset everything.
- TONE: melancholic, slow, beautiful and inhuman. Sentences linger. Time stretches. Mortals are loved and far.`,
};

/**
 * Resolve the power-rule block to inject. For "custom", wraps the user's
 * freeform powerCustom text under a generic header.
 */
function buildPowerBlock(c: Campaign): string {
  const lvl = getEffectivePowerLevel(c);
  if (lvl === "custom") {
    const txt = (c.protagonist.powerCustom ?? "").trim();
    if (!txt) return "";
    return `═══ POWER PROFILE — Custom (player-defined) ═══\n${txt}`;
  }
  return POWER_BLOCKS[lvl];
}

/**
 * STABLE block — does not change between turns of the same campaign.
 * Suitable for prompt caching (Anthropic cache_control / OpenAI auto-cache).
 * Contains: STORY_SYS rules, World Bible, Protagonist, optional Overlord rule.
 */
export function buildSystemPromptStable(c: Campaign): string {
  const lang = useSettings.getState().ui.lang;
  const storyLang = lang === "vi" ? "Vietnamese (Tiếng Việt)" : "English";
  const sys = STORY_SYS
    .replace("{STORY_LANG}", storyLang)
    .replace("{VI_PRONOUNS}", lang === "vi" ? VI_PRONOUN_RULES : "");
  const hints = extractHints(c);
  const hintBlock = (hints.abilities || hints.opening || hints.difficulty)
    ? `\n═══ CAMPAIGN SETUP (player's choices at creation — HONOR these throughout the campaign) ═══${
        hints.abilities ? `\nProtagonist's starting abilities / skills: ${hints.abilities}` : ""
      }${
        hints.opening ? `\nDesired opening situation: ${hints.opening}` : ""
      }${
        hints.difficulty ? `\nDifficulty: ${hints.difficulty}` : ""
      }\n`
    : "";

  return `${sys}

═══ HISTORY FORMAT NOTE ═══
Past assistant turns in this conversation are shown in a COMPACT plain-text form to save tokens:
  Plain line          → narrate
  [bracketed line]    → act
  Name: "..."         → say
  (Name: ...)         → think
  ~ italic ~          → system note
You MUST still emit your NEW response using the FULL XML tag format defined above. Do NOT mimic the compact format.

═══ WORLD BIBLE ═══
Title: ${c.bible.title}
Genre: ${c.bible.genre} · Tone: ${c.bible.tone}

Setting:
${c.bible.setting}

Rules:
${(c.bible?.rules ?? []).map(r => `- ${r}`).join("\n")}

Factions:
${(c.bible?.factions ?? []).map(f => `- ${f.name}: ${f.desc}`).join("\n")}

Key Figures (HONOR each character's register and tic when they speak):
${(c.bible?.keyCharacters ?? []).map(k => {
  const voice = (k.register || k.tic)
    ? ` [voice: ${k.register || "?"}${k.tic ? `; occasional tic (USE SPARINGLY — see rule F): "${k.tic}"` : ""}]`
    : "";
  return `- ${k.name} (${k.role})${voice}: ${k.desc}`;
}).join("\n")}

═══ PROTAGONIST (the player controls this character) ═══
${c.protagonist.name} — ${c.protagonist.role}
${c.protagonist.description}
${hintBlock}
${buildPowerBlock(c)}`;
}

/**
 * DYNAMIC block — changes nearly every turn. Not cached.
 * HUD state, memory crystals, and the pacing nudge.
 *
 * Returns "" when there's nothing meaningful to say (no HUD, no crystals,
 * no pacing nudge). The caller can then skip the system message entirely
 * to save tokens on early-game turns.
 */
export function buildSystemPromptDynamic(c: Campaign): string {
  const huds = (c.hud?.widgets ?? []).map(w => {
    if (w.type === "stat-bar") return `  - ${w.id} (stat-bar "${w.label}"): ${w.value}/${w.max}`;
    if (w.type === "stat-number") return `  - ${w.id} (stat-number "${w.label}"): ${w.value}`;
    if (w.type === "tag-list") return `  - ${w.id} (tag-list "${w.label}"): [${(w.tags ?? []).join(", ")}]`;
    if (w.type === "affinity") return `  - ${w.id} (affinity "${w.label}"): ${Object.entries(w.values ?? {}).map(([k,v])=>`${k}=${v}`).join(", ") || "(empty)"}`;
    if (w.type === "inventory") return `  - ${w.id} (inventory "${w.label}"): ${(w.items ?? []).map(i => `${i.name}×${i.qty ?? 1}`).join(", ") || "(empty)"}`;
    if (w.type === "note") return `  - ${w.id} (note "${w.label}"): ${w.body ?? ""}`;
    return "";
  }).filter(Boolean).join("\n");

  const crystals = (c.crystals ?? []).map(cr => `[T${cr.turn}] ${cr.title}: ${cr.summary}`).join("\n");

  const recentBeats = (c.scenes ?? []).slice(-3).map(s => s.beat).filter(Boolean) as string[];
  const intense = new Set(["action", "plot"]);
  const intenseStreak = recentBeats.length >= 2 && recentBeats.every(b => intense.has(b));
  const pacingHint = intenseStreak
    ? `═══ PACING NUDGE ═══\nThe last ${recentBeats.length} turns were all "${recentBeats.join(" + ")}". This turn MUST be a non-intense beat (downtime, banter, romance, sidequest, introspection, or worldbuilding) UNLESS the player's input directly forces violence. Let the world breathe.`
    : "";

  // Skip empty sections; if everything is empty, return "" so the caller can
  // omit the system message entirely.
  const sections: string[] = [];
  if (pacingHint) sections.push(pacingHint);
  if (huds) sections.push(`═══ CURRENT HUD STATE ═══\n${huds}`);
  if (crystals) sections.push(`═══ MEMORY CRYSTALS (key past events) ═══\n${crystals}`);
  return sections.join("\n\n");
}

/** Combined system prompt — used for one-shot calls (e.g. compression summary). */
export function buildSystemPrompt(c: Campaign): string {
  return `${buildSystemPromptStable(c)}\n\n${buildSystemPromptDynamic(c)}`;
}

/* ---------- Streaming parser ---------- */

const TAG_RE = /<(\/?)(narrate|act|say|think|system|hud|crystal|suggest|scene)([^>]*)(\/?)>/gi;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

export interface ParsedDoc {
  panels: Panel[];
  hudOps: HudOp[];
  crystals: { title: string; summary: string }[];
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

/** Parses the entire raw output into structured panels + HUD ops. */
export function parseStory(raw: string): ParsedDoc {
  const panels: Panel[] = [];
  const hudOps: HudOp[] = [];
  const crystals: { title: string; summary: string }[] = [];
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

    // Accumulate text since last cursor into the top of the stack
    const chunk = raw.slice(cursor, start);
    if (stack.length > 0 && chunk.trim()) {
      stack[stack.length - 1].text += chunk;
    }
    cursor = end;

    if (isSelf || lc === "hud" || lc === "crystal" || lc === "scene") {
      const attrs = parseAttrs(attrText);
      if (lc === "hud") hudOps.push(toHudOp(attrs));
      else if (lc === "crystal") crystals.push({ title: attrs.title ?? "", summary: attrs.summary ?? "" });
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
            else panels.push(toPanel(open.tag, open.attrs, text));
          }
          // discard any unclosed inner tags
          stack.length = i;
          break;
        }
      }
    }
  }

  // Flush any unclosed openers (live streaming case).
  const trailing = raw.slice(cursor);
  if (stack.length > 0 && trailing.trim()) {
    stack[stack.length - 1].text += trailing;
  }

  for (const open of stack) {
    const text = open.text.trim();
    if (text) {
      if (open.tag === "suggest") suggestions.push(text);
      else panels.push(toPanel(open.tag, open.attrs, text));
    }
  }

  return { panels, hudOps, crystals, suggestions, mood, beat };
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((m = re.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

function toPanel(tag: string, attrs: Record<string, string>, text: string): Panel {
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
async function compressIfNeeded(c: Campaign): Promise<Campaign> {
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
  const dynamic = buildSystemPromptDynamic(c);
  const history = (c.scenes ?? []).flatMap<{ role: "user" | "assistant"; content: string; cache?: boolean }>(s => {
    const out: { role: "user" | "assistant"; content: string }[] = [];
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
    maxTokens: 1200,
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

  return { raw: acc, parsed: parseStory(acc) };
}

function formatInput(i: NonNullable<PlayTurnArgs["input"]>): string {
  switch (i.mode) {
    case "say":   return `[Speech] ${i.text}`;
    case "do":    return `[Action] ${i.text}`;
    case "think": return `[Inner thought] ${i.text}`;
    case "ooc":   return `[OOC — out of character note to GM] ${i.text}`;
  }
}

/**
 * Compact plain-text rendering of past panels — used in conversation history
 * to cut token cost vs. the full XML form. The system prompt teaches the model
 * how to read this without imitating it in its own output.
 */
function panelsToCompact(panels: Panel[]): string {
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
