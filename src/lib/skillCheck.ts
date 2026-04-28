/**
 * Auto skill check inference.
 *
 * Given a player's freeform "Do" action and the campaign's HUD widgets,
 * pick the most relevant stat to roll against and propose a difficulty.
 *
 * Heuristic, not perfect — the player can always ignore the suggestion.
 *
 * Strategy:
 *  1. Score every stat-bar / stat-number widget against keyword groups
 *     (combat, stealth, social, magic, athletics, perception, lore, craft).
 *  2. Pick the highest-scoring widget. If nothing matches strongly, fall
 *     back to a generic d20.
 *  3. Difficulty (DC) inferred from action verbs: "carefully" lower,
 *     "leap across the chasm" / "climb the cliff" higher.
 */
import type { HudWidget, PowerLevel } from "@/state/types";
import { rollExpression, type RollResult } from "./dice";

type Family = "combat" | "stealth" | "social" | "magic" | "athletics" | "perception" | "lore" | "craft" | "willpower";

const VERBS: Record<Family, RegExp> = {
  combat:     /\b(attack|strike|stab|slash|punch|kick|swing|fight|parry|block|shoot|fire|aim|đánh|chém|đấm|đá|tấn công|bắn|xả|đỡ)\b/i,
  stealth:    /\b(sneak|hide|tiptoe|pickpocket|slip|creep|conceal|lurk|lén|trốn|ẩn|nấp|móc túi|rình)\b/i,
  social:     /\b(persuade|convince|seduce|charm|bluff|lie|deceive|intimidate|threaten|negotiate|flirt|comfort|thuyết phục|dụ|tán tỉnh|dọa|đe dọa|nói dối|đàm phán|an ủi)\b/i,
  magic:      /\b(cast|spell|chant|incant|summon|banish|hex|enchant|ritual|niệm chú|triệu hồi|trục|phù|nguyền)\b/i,
  athletics:  /\b(climb|leap|jump|swim|run|sprint|vault|dash|push|lift|carry|leo|nhảy|bơi|chạy|đẩy|nâng|vác)\b/i,
  perception: /\b(look|search|listen|smell|inspect|notice|spot|observe|peek|study|nhìn|tìm|nghe|quan sát|để ý|xem xét)\b/i,
  lore:       /\b(recall|remember|recognize|identify|study|know|read|decipher|nhớ|nhận ra|hiểu|đọc|giải mã)\b/i,
  craft:      /\b(craft|forge|repair|build|pick lock|disarm|tinker|hack|chế|rèn|sửa|xây|cạy khóa|tháo bẫy|hack)\b/i,
  willpower:  /\b(resist|endure|withstand|focus|meditate|hold|brace|chống lại|chịu đựng|tập trung|thiền|nén)\b/i,
};

const STAT_HINTS: Record<Family, RegExp> = {
  combat:     /atk|attack|str|strength|power|might|combat|war|sức|công|lực/i,
  stealth:    /stealth|dex|dexterity|agi|agility|sneak|lén|nhanh nhẹn/i,
  social:     /cha|charisma|social|persuasion|charm|duyên|nói|giao tiếp/i,
  magic:      /int|intelligence|mp|mana|arcane|magic|spirit|wis|wisdom|trí|phép|linh/i,
  athletics:  /str|athl|stamina|hp|sta|con|constitution|endurance|sức|bền|thể/i,
  perception: /per|perception|wis|insight|awareness|nhận|quan sát/i,
  lore:       /int|lore|knowledge|history|kiến thức|lịch sử/i,
  craft:      /dex|craft|tech|skill|tinker|kỹ thuật|chế/i,
  willpower:  /wil|will|wis|spirit|focus|ý chí|tinh thần/i,
};

const HARD_HINTS = /\b(impossible|massive|huge|chasm|cliff|fortress|legendary|epic|guarded|locked|reinforced|khổng lồ|bất khả|vực|vách đá|pháo đài|huyền thoại|niêm phong)\b/i;
const EASY_HINTS = /\b(easy|simple|small|trivial|quick|carefully|slowly|dễ|đơn giản|nhỏ|nhẹ|cẩn thận|từ từ)\b/i;

export interface SkillSuggestion {
  family: Family;
  /** The HUD widget id we'll roll against, if any. */
  widgetId?: string;
  /** Display label for the stat. */
  statLabel: string;
  /** Numeric modifier added to the d20. */
  modifier: number;
  /** Suggested target number (DC). */
  dc: number;
  /** Final dice expression to roll, e.g. "d20+3". */
  expression: string;
}

/** Score how well a verb family matches the player's text. */
function scoreFamilies(text: string): { family: Family; score: number }[] {
  const out: { family: Family; score: number }[] = [];
  for (const [family, re] of Object.entries(VERBS) as [Family, RegExp][]) {
    const matches = text.match(re);
    if (matches) out.push({ family, score: matches.length });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Score how well a widget label matches a family. */
function widgetScoreForFamily(w: HudWidget, family: Family): number {
  if (w.type !== "stat-bar" && w.type !== "stat-number") return 0;
  const re = STAT_HINTS[family];
  return re.test(`${w.id} ${w.label}`) ? 1 : 0;
}

/** Pull a numeric value out of any stat widget. Returns 0 if non-numeric. */
function widgetNumeric(w: HudWidget): number {
  if (w.type === "stat-bar") return w.value;
  if (w.type === "stat-number") return typeof w.value === "number" ? w.value : 0;
  return 0;
}

/** Convert a raw stat number into a +/- d20 modifier. */
function statToModifier(stat: number, isBar: boolean): number {
  if (isBar) {
    // Bars (HP/MP) are pools, not stats. Treat current/max ratio as a small bonus/penalty.
    return 0;
  }
  // D&D-style: (stat - 10) / 2, clamped.
  const m = Math.floor((stat - 10) / 2);
  return Math.max(-3, Math.min(8, m));
}

/**
 * DC profile per power tier — { default, easy, hard }.
 * For tiers planet/galaxy-comedic/universal we return null entirely (skip
 * dice rolls — the GM narrates outcomes directly).
 */
const DC_PROFILES: Record<Exclude<PowerLevel, "custom">, { def: number; easy: number; hard: number } | null> = {
  "below-average":     { def: 10, easy: 8,  hard: 13 },
  "wall-building":     { def: 12, easy: 10, hard: 17 },
  "city-mountain":     { def: 14, easy: 12, hard: 19 },
  "country-continent": { def: 18, easy: 14, hard: 22 },
  "planet":            null,
  "galaxy-comedic":    null,
  "universal":         null,
};

export function suggestSkillCheck(
  text: string,
  widgets: HudWidget[],
  powerLevel?: PowerLevel,
): SkillSuggestion | null {
  if (!text.trim()) return null;

  // Disable rolls entirely for OP tiers — GM narrates outcomes.
  // "custom" falls through to the default profile (wall-building).
  const tierKey = (powerLevel && powerLevel !== "custom" ? powerLevel : "wall-building") as Exclude<PowerLevel, "custom">;
  const profile = DC_PROFILES[tierKey];
  if (!profile) return null;

  const families = scoreFamilies(text);
  if (families.length === 0) return null;

  // Pick the top family that has a matching widget — fall back to top family alone.
  let chosen: { family: Family; widget?: HudWidget } | null = null;
  for (const f of families) {
    const widget = widgets.find(w => widgetScoreForFamily(w, f.family) > 0);
    if (widget) { chosen = { family: f.family, widget }; break; }
  }
  if (!chosen) chosen = { family: families[0].family };

  const w = chosen.widget;
  const modifier = w
    ? statToModifier(widgetNumeric(w), w.type === "stat-bar")
    : 0;

  // Difficulty class — scaled to the power tier.
  let dc = profile.def;
  if (HARD_HINTS.test(text)) dc = profile.hard;
  else if (EASY_HINTS.test(text)) dc = profile.easy;

  const sign = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`;
  const expression = `d20${sign}`;
  const statLabel = w ? ((w as any).label ?? chosen.family) : chosen.family;

  return {
    family: chosen.family,
    widgetId: w?.id,
    statLabel,
    modifier,
    dc,
    expression,
  };
}

/** Format the rolled result as a chat-embeddable string. */
export function formatSkillCheck(s: SkillSuggestion, r: RollResult): string {
  const verdict =
    r.crit ? "✦CRIT"
    : r.fumble ? "✗FUMBLE"
    : r.total >= s.dc ? `✓ ${r.total} vs DC ${s.dc}`
    : `✗ ${r.total} vs DC ${s.dc}`;
  return `*🎲 [${s.statLabel}] ${r.breakdown} — ${verdict}*`;
}

export function rollSkillCheck(s: SkillSuggestion): RollResult {
  return rollExpression(s.expression);
}
