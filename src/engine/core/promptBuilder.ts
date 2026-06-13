import type { Campaign, PowerLevel } from "@/state/types";
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
 *   <crystal title="..." summary="..."/>       -- pin a memory (no longer
 *       prompted — kept in the parser for back-compat with old transcripts;
 *       context compression now creates crystals instead)
 *
 * Why tags? They stream cleanly (vs. JSON which must be fully balanced),
 * survive partial output, and the parser can flush completed panels live.
 */

const STORY_SYS = `You are the Game Master of an IsekAI roleplay session. You narrate, voice every character, and react to the player while staying true to the World Bible.

═══ OUTPUT FORMAT ═══
CRITICAL: You MUST wrap EVERY SINGLE SENTENCE in an XML tag. NEVER output plain text without a tag. No markdown. Place them sequentially.

  <narrate>Third-person, sensory, present-tense.</narrate>
  <act>A concise physical beat.</act>
  <say speaker="Name">Dialogue.</say>
  <think speaker="Name">First-person inner thought ONLY — speaker attr REQUIRED. Third-person description goes in <narrate>, never here.</think>
  <system>GM note: time passing, scene transition, world reaction.</system>

Inline between panels — HUD ops and memory pins:
  <hud op="delta|set" id="<existing-id>" value="-15"/>
  <hud op="tag-add|tag-remove" id="<existing-id>" value="poisoned"/>
  <hud op="affinity" id="<existing-id>" name="Rinka" value="+5"/>
  <hud op="item-add|item-remove" id="<existing-id>" name="Iron Sword" qty="1"/>
  <bible-add type="character|faction|rule" name="..." desc="..."/>

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
7. <bible-add> ONLY for major recurring characters/factions/rules invented mid-game. NEVER use for throwaway entities.
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

  // Sequel campaigns carry a condensed recap of the previous part. It lives
  // in the STABLE block so it's cached, and it outranks the generic opening
  // instructions: the GM must continue the story, not restart it.
  const recapBlock = c.recap?.trim()
    ? `\n═══ PREVIOUSLY — RECAP OF PART ${(c.part ?? 2) - 1} ═══
${c.recap.trim()}

═══ CONTINUATION RULES (this campaign is PART ${c.part ?? 2} of an ongoing story) ═══
- HONOR every fact in the recap: deaths stay dead, relationships and promises carry over, items and abilities persist.
- Known characters are NOT strangers — no re-introductions, no amnesia.
- The opening turn re-grounds the player in "where we left off" (time may have passed — say how much), then pushes FORWARD into a new arc. Do not re-tell Part ${(c.part ?? 2) - 1}.
- Unresolved threads from the recap are your fuel — pay them off or escalate them.\n`
    : "";

  return `${sys}

═══ HISTORY FORMAT NOTE ═══
Past assistant turns in this conversation are shown in a COMPACT plain-text form to save tokens:
  Plain line          → narrate
  [bracketed line]    → act
  Name: "..."         → say
  (Name: ...)         → think
  ~ italic ~          → system note
WARNING: You are the GM. You MUST NOT mimic this compact format in your NEW output. You MUST use FULL XML TAGS (e.g. <say>, <act>) for your current turn! Any output without tags is a violation!

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
${hintBlock}${recapBlock}
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

  const sections: string[] = [];
  if (pacingHint) sections.push(pacingHint);
  if (huds) sections.push(`═══ CURRENT HUD STATE ═══\n${huds}`);
  if (crystals) sections.push(`═══ MEMORY CRYSTALS (key past events) ═══\n${crystals}`);
  // Format reminder lives HERE (after the long compact history, right before
  // the user input) because on long campaigns the model starts imitating the
  // tagless compact history and silently drops the <scene/> + <suggest>
  // closers mandated at the top of the (now distant) stable block.
  sections.push(`═══ FORMAT REMINDER ═══\nWrap every sentence in XML tags (<narrate>/<act>/<say>/<think>). End this turn with exactly ONE <scene mood beat/> + 3 <suggest> chips — never skip them.`);
  return sections.join("\n\n");
}

/** Combined system prompt — used for one-shot calls (e.g. compression summary). */
export function buildSystemPrompt(c: Campaign): string {
  return `${buildSystemPromptStable(c)}\n\n${buildSystemPromptDynamic(c)}`;
}


