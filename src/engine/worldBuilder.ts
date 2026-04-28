import { nanoid } from "nanoid";
import { completeJSON } from "./chat";
import { scrapeUrl } from "./scraper";
import type { Campaign, HudSchema, PowerLevel, Source, WorldBible } from "@/state/types";
import { useSettings } from "@/state/settings";

function getLangNote(): string {
  const lang = useSettings.getState().ui.lang;
  if (lang === "vi") {
    return "\n\nIMPORTANT: Write ALL text values in Vietnamese (Tiếng Việt). This includes setting descriptions, rules, faction descriptions, character descriptions, widget labels, tag names, item names, note bodies, and any other prose. Only keep proper nouns (character names, place names, title of the work) in their original language.";
  }
  return "";
}

const BIBLE_SYS = `You are the World Architect for IsekAI, an interactive roleplay engine.
Your job: take the user's seed (a manga title, a wiki URL, a freeform description, or "surprise me") and produce a compact World Bible.

Return ONLY valid JSON matching this TypeScript shape — no prose, no fences:

{
  "title": string,                 // The world or work's title.
  "genre": string,                 // Lowercase tag like "isekai-fantasy", "cyberpunk-noir", "shonen-battle", "romance-school", "mystery-detective", "post-apocalyptic", "slice-of-life", "horror-cosmic".
  "tone": string,                  // "lighthearted" | "grimdark" | "tragic-romance" | "hopeful" | "tense" | "comedic" | "epic"
  "setting": string,               // 2-3 short paragraphs. Write as IN-FICTION OBSERVATION, not encyclopedia. Open with a concrete sensory image (a sound, a smell, a specific street at a specific hour) that tells the reader what KIND of world this is. Then layer in era, mood, and the central tension THROUGH that image. Avoid "This is a world where..." / "Đây là một thế giới mà...". Avoid bullet-point exposition. Think first paragraph of a novel, not Wikipedia summary.
  "rules": string[],               // 3-6 bullets: power systems, magic laws, technology constraints, social rules.
  "factions": [{ "name": string, "desc": string }],     // 2-5 entries.
  "keyCharacters": [{ "name": string, "role": string, "desc": string, "register": string, "tic": string }]   // 3-6 named figures the player might meet.
}

For each keyCharacter, "register" and "tic" are MANDATORY — they make the cast feel like distinct people instead of interchangeable AI voices:
  - "register": pick ONE of "terse" | "ornate" | "rustic" | "military" | "scholarly" | "playful" | "broken" | "formal" | "vulgar" | "archaic". Shapes how they speak.
  - "tic": a single concrete verbal habit, DESCRIBED as a behavior — NOT a literal phrase to be pasted onto every line. Good examples: "Refuses contractions", "Trails off mid-sentence when uncertain (—)", "Always understates ('a small wound' for a stab)", "Calls everyone 'friend' even enemies", "Quotes obscure proverbs", "Asks two questions where one would do", "Uses metaphors from carpentry". BAD examples (do NOT do this): "Ends every line with 'desu ne~'", "Says 'aye' after every sentence", "Always finishes with 'ja na'" — these get spammed by language models. The tic should be a TENDENCY, not a stamp.

If the seed names an existing manga / light novel / anime / game, faithfully render its established lore. If it's a freeform description, build something coherent. If it's "surprise me", invent something fresh and evocative.
Keep prose tight and atmospheric. Avoid copyrighted long-form quotes.{LANG}`;

const HUD_SYS = `You design genre-appropriate HUDs for IsekAI roleplay sessions.
Given a World Bible, return a JSON HudSchema that surfaces the most relevant info for that genre.

Schema:
{
  "genre": string,    // Short label shown to user, e.g. "Isekai RPG", "Cyberpunk Noir".
  "widgets": HudWidget[]
}

HudWidget is a discriminated union — pick types that fit the genre:

  { "type": "stat-bar", "id": string, "label": string, "value": number, "max": number, "icon"?: string, "accent"?: string }
  { "type": "stat-number", "id": string, "label": string, "value": number|string, "icon"?: string, "accent"?: string }
  { "type": "tag-list", "id": string, "label": string, "tags": string[] }
  { "type": "affinity", "id": string, "label": string, "values": { "<name>": number } }   // -100..100
  { "type": "inventory", "id": string, "label": string, "items": [{ "name": string, "qty"?: number, "rarity"?: string }] }
  { "type": "note", "id": string, "label": string, "body": string }

Icon names (use lowercase, lucide-react): heart, zap, shield, sparkle, sword, brain, eye, coins, scroll, flame, moon, sun, key, lock, wand, flask, skull, star, crown, gem, target.
Accent: pick from "vermillion", "cyan", "amber", "violet", "jade", "rose".

Guidelines by genre:
- RPG / battle / isekai: HP, MP, level/XP bar, inventory, status tags, party affinity.
- Romance / school: affinity for love interests, mood tag, day/period note.
- Mystery / detective: clue list (tag-list), suspect affinity, time-of-day note.
- Cyberpunk / noir: HP, cred (currency stat-number), heat (stat-bar), augments (inventory), contacts (affinity).
- Slice of life: mood, current task, friends affinity.
- Horror: sanity bar, light/visibility tag-list, items.

Return 3-6 widgets total. ONLY JSON.{LANG}`;

const PROTAGONIST_SYS = `You design a protagonist for an IsekAI session, given the World Bible and the user's preference.
Return JSON only:
{ "name": string, "role": string, "description": string }

If the user names a canon character, faithfully render them.
If the user wants their own OC, ensure the protagonist fits the world's rules.
"role" is a short label like "Original Character (Mage)" or "Canon: Edward Elric".
"description" is 2-3 sentences: appearance, personality, ability, current motivation.{LANG}`;

export type Difficulty = "easy" | "normal" | "hard";

export interface BuildOptions {
  source: Source;
  protagonistHint?: string;    // "I want to play X" or "create my own OC, female mage"
  abilitiesHint?: string;      // "can use fire magic, weak physically"
  startingSceneHint?: string;  // "start in a tavern after a heist gone wrong"
  difficulty?: Difficulty;     // affects DC and GM tone
  /** Player-chosen power level. Undefined → auto-detect at runtime. */
  powerLevel?: PowerLevel;
  /** Freeform power profile, used when powerLevel === "custom". */
  powerCustom?: string;
  signal?: AbortSignal;
}

export async function buildCampaign(opts: BuildOptions): Promise<Campaign> {
  const langNote = getLangNote();
  const bibleSys = BIBLE_SYS.replace("{LANG}", langNote);
  const hudSys = HUD_SYS.replace("{LANG}", langNote);
  const protagSys = PROTAGONIST_SYS.replace("{LANG}", langNote);

  let seed = describeSource(opts.source);
  // For URL sources, scrape the page first and feed the cleaned text into the prompt.
  if (opts.source.kind === "url") {
    try {
      const scraped = await scrapeUrl(opts.source.input, opts.signal);
      seed = `${seed}\n\n--- Scraped reference (from ${opts.source.input}) ---\n${scraped}`;
    } catch (e) {
      // Fall through to LLM-only reasoning if scrape fails.
      seed = `${seed}\n\n(Note: scrape of ${opts.source.input} failed — rely on prior knowledge of the work.)`;
    }
  }
  const rawBible = await completeJSON<WorldBible>(bibleSys, seed, { signal: opts.signal });
  // Sanitize: AI sometimes omits one of the array fields. Fill with [] so
  // downstream code (WorldEditView, prompt builders) can rely on iteration.
  const bible: WorldBible = {
    ...rawBible,
    rules: rawBible.rules ?? [],
    factions: rawBible.factions ?? [],
    keyCharacters: rawBible.keyCharacters ?? [],
  };

  const rawHud = await completeJSON<HudSchema>(
    hudSys,
    `World Bible:\n${JSON.stringify(bible)}`,
    { signal: opts.signal },
  );
  const hud: HudSchema = { ...rawHud, widgets: rawHud.widgets ?? [] };

  const diffNote = opts.difficulty === "hard"
    ? " The difficulty is HARD: the GM should be unforgiving, enemies tough, consequences severe."
    : opts.difficulty === "easy"
    ? " The difficulty is EASY: the GM should be generous, obstacles surmountable, tone encouraging."
    : "";

  const protag = await completeJSON<Campaign["protagonist"]>(
    protagSys,
    [
      `World Bible:\n${JSON.stringify(bible)}`,
      `User preference: ${opts.protagonistHint || "create a fitting Original Character with an interesting hook"}`,
      opts.abilitiesHint ? `Starting abilities / skills: ${opts.abilitiesHint}` : "",
      opts.startingSceneHint ? `Desired opening situation: ${opts.startingSceneHint}` : "",
    ].filter(Boolean).join("\n\n"),
    { signal: opts.signal, temperature: 0.8 },
  );

  // Stash extra hints into source.input so storyEngine can use them in the opening turn prompt.
  const enrichedSource: Source = {
    ...opts.source,
    input: [
      opts.source.input,
      opts.startingSceneHint ? `[Opening scene: ${opts.startingSceneHint}]` : "",
      opts.abilitiesHint ? `[Protagonist abilities: ${opts.abilitiesHint}]` : "",
      diffNote ? `[Difficulty${diffNote}]` : "",
    ].filter(Boolean).join(" "),
  };

  // Attach the player-chosen power profile (or freeform custom text) to the
  // protagonist after AI generation. The AI never fills these fields itself.
  const protagonist: Campaign["protagonist"] = {
    ...protag,
    ...(opts.powerLevel ? { powerLevel: opts.powerLevel } : {}),
    ...(opts.powerCustom?.trim() ? { powerCustom: opts.powerCustom.trim() } : {}),
  };

  return {
    id: nanoid(10),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: enrichedSource,
    bible,
    protagonist,
    hud,
    scenes: [],
    crystals: [],
  };
}

function describeSource(s: Source): string {
  switch (s.kind) {
    case "title": return `The user wants to enter the world of: "${s.input}". Build the World Bible for this title.`;
    case "world": return `The user describes a custom world:\n\n${s.input}\n\nBuild a coherent World Bible from this seed.`;
    case "url":   return `The user pasted this reference URL: ${s.input}\nInfer the work it points to (likely a Fandom or Wikipedia page) and build the World Bible from your knowledge of that work. If unfamiliar, build a plausible world matching the URL's slug.`;
    case "rng":   return `Surprise the user. Pick a fresh, evocative world — anything from cosmic horror to slow-burn romance. Be original.`;
  }
}
