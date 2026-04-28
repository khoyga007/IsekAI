/**
 * Domain model for IsekAI campaigns.
 * A "Campaign" is one ongoing roleplay: a world bible, a protagonist,
 * a HUD shaped to the genre, and an unfolding story of scenes.
 */

export type SourceKind = "title" | "world" | "url" | "rng";

export interface Source {
  kind: SourceKind;
  input: string;
}

export interface WorldBible {
  title: string;
  genre: string;          // Free-form: "isekai-fantasy", "cyberpunk-noir", "romance-school", etc.
  tone: string;           // "grimdark", "lighthearted", "tragic-romance"
  setting: string;        // 2-3 paragraphs of world description.
  rules: string[];        // Power systems, magic laws, technology constraints.
  factions: { name: string; desc: string }[];
  keyCharacters: {
    name: string;
    role: string;
    desc: string;
    /** Speech register — terse / ornate / rustic / military / scholarly / playful / broken / formal. Drives how the AI voices them. */
    register?: string;
    /** A short verbal tic — a phrase, filler, or sentence-starting/ending habit the AI should reuse to make the character recognizable. */
    tic?: string;
    /** Avatar URL (AniList CDN, Pollinations gen, or user-uploaded data URL). */
    avatar?: string;
  }[];
}

/**
 * Power scale archetypes (VS Battles-flavored labels). Drives combat tension,
 * skill-check DC range, HUD relevance, and enemy scaling. "custom" lets the
 * user describe their own profile via `powerCustom`.
 */
export type PowerLevel =
  | "below-average"      // T0 — civilian, untrained
  | "wall-building"      // T1 — trained adventurer / standard hero
  | "city-mountain"      // T2 — regional champion
  | "country-continent"  // T3 — legendary national-tier hero
  | "planet"             // T4 — overlord / demigod (combat tension dead, grim)
  | "galaxy-comedic"     // T5 — Saitama-style absurd OP
  | "universal"          // T5 — cosmic / philosophical (Manhattan)
  | "custom";            // freeform — uses powerCustom text as the rule

export interface Protagonist {
  name: string;
  role: string;          // "Original Character" or a canon character name.
  description: string;
  /** Optional power scale. Defaults to wall-building when omitted. */
  powerLevel?: PowerLevel;
  /** Freeform power description, used when powerLevel === "custom". */
  powerCustom?: string;
  /** Avatar URL (AniList CDN, Pollinations gen, or user-uploaded data URL). */
  avatar?: string;
}

/* --- Dynamic HUD --- */

export type HudWidget =
  | StatBarWidget
  | StatNumberWidget
  | TagListWidget
  | AffinityWidget
  | InventoryWidget
  | NoteWidget;

interface BaseWidget {
  id: string;
  label: string;
  /** Hex or CSS var name for accent color. */
  accent?: string;
}

export interface StatBarWidget extends BaseWidget {
  type: "stat-bar";
  value: number;
  max: number;
  /** Lucide icon name (lowercased), e.g., "heart", "zap". */
  icon?: string;
}

export interface StatNumberWidget extends BaseWidget {
  type: "stat-number";
  value: number | string;
  icon?: string;
}

export interface TagListWidget extends BaseWidget {
  type: "tag-list";
  tags: string[];
}

export interface AffinityWidget extends BaseWidget {
  type: "affinity";
  /** Map of character name → affinity score (-100..100). */
  values: Record<string, number>;
}

export interface InventoryWidget extends BaseWidget {
  type: "inventory";
  items: { name: string; qty?: number; rarity?: string }[];
}

export interface NoteWidget extends BaseWidget {
  type: "note";
  body: string;
}

export interface HudSchema {
  /** Detected genre label shown at top of rail. */
  genre: string;
  widgets: HudWidget[];
}

/* --- Story --- */

export type PanelKind = "narration" | "dialogue" | "thought" | "action" | "system";

export interface Panel {
  kind: PanelKind;
  speaker?: string;
  text: string;
}

export interface Scene {
  id: string;
  turn: number;
  /** What the player typed (mode + text). null for the opening scene. */
  playerInput?: { mode: "say" | "do" | "think" | "ooc"; text: string };
  panels: Panel[];
  /** Patches to apply to HUD widgets after this scene. */
  hudPatch?: Record<string, Partial<HudWidget>>;
  /** AI-suggested next-action chips shown under this scene. */
  suggestions?: string[];
  /** AI-tagged emotional mood for this scene — drives backdrop + ambient audio. */
  mood?: string;
  /** AI-tagged beat type — action / plot / downtime / banter / romance / sidequest / introspection / worldbuilding. Drives pacing variety. */
  beat?: string;
}

export interface MemoryCrystal {
  id: string;
  turn: number;
  title: string;
  summary: string;
}

/**
 * A save point captures a slice of the campaign at a specific turn.
 * Restoring rewinds the active campaign to that turn; branching forks
 * the snapshot into a brand-new campaign with its own ID.
 */
export interface SavePoint {
  id: string;
  label: string;
  createdAt: number;
  /** Number of scenes that existed at the time of the bookmark. */
  turn: number;
  /** Full campaign snapshot at that point — minus its own bookmarks. */
  snapshot: Omit<Campaign, "bookmarks">;
}

export interface Campaign {
  id: string;
  createdAt: number;
  updatedAt: number;
  source: Source;
  bible: WorldBible;
  protagonist: Protagonist;
  hud: HudSchema;
  scenes: Scene[];
  crystals: MemoryCrystal[];
  /** User-pinned save points. Optional for backwards compat with older campaigns. */
  bookmarks?: SavePoint[];
}
