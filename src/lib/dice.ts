/**
 * Dice expression parser/roller.
 *
 * Supports the canonical RPG notation:
 *   d20            -> 1 die, 20 sides
 *   2d6            -> 2 dice, 6 sides each
 *   2d6+3          -> add a flat modifier
 *   d20-1          -> negative modifier
 *   3d8+2d4+1      -> chain multiple groups
 *   adv  / dis     -> advantage / disadvantage prefix (rolls 2d20, picks high/low)
 *
 * Returns a rich result so the UI can show every die face individually.
 */

export interface DieRoll { sides: number; value: number; dropped?: boolean }
export interface RollResult {
  expression: string;
  dice: DieRoll[];
  modifier: number;
  total: number;
  /** Human-readable breakdown like "[12, 8] + 3 = 23". */
  breakdown: string;
  /** True if this was the only die and it crit (max) or fumbled (1 on d20). */
  crit?: boolean;
  fumble?: boolean;
}

const GROUP_RE = /([+-]?)\s*(\d*)d(\d+)/gi;
const MOD_RE = /([+-])\s*(\d+)(?!\s*d)/g;

export function rollExpression(expr: string): RollResult {
  const cleaned = expr.replace(/\s+/g, "").toLowerCase();

  // Detect adv/dis prefix.
  let adv: "adv" | "dis" | null = null;
  let body = cleaned;
  if (body.startsWith("adv")) { adv = "adv"; body = body.slice(3); }
  else if (body.startsWith("dis")) { adv = "dis"; body = body.slice(3); }

  const dice: DieRoll[] = [];
  let modifier = 0;

  // Roll dice groups.
  let m: RegExpExecArray | null;
  const re = new RegExp(GROUP_RE.source, "gi");
  while ((m = re.exec(body)) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    const count = m[2] ? parseInt(m[2], 10) : 1;
    const sides = parseInt(m[3], 10);
    if (!sides || count <= 0) continue;
    for (let i = 0; i < count; i++) {
      const v = 1 + Math.floor(Math.random() * sides);
      dice.push({ sides, value: sign < 0 ? -v : v });
    }
  }

  // Sum modifiers (+N / -N not followed by 'd').
  // We strip the dice groups first to avoid double-counting.
  const noDice = body.replace(/[+-]?\d*d\d+/g, "");
  let mm: RegExpExecArray | null;
  const mre = new RegExp(MOD_RE.source, "g");
  while ((mm = mre.exec(noDice)) !== null) {
    modifier += (mm[1] === "-" ? -1 : 1) * parseInt(mm[2], 10);
  }
  // First number with no sign? (e.g. "d20+3" — handled. "5" alone — modifier.)
  const lonely = noDice.match(/^(\d+)/);
  if (lonely && !cleaned.match(/[+-]/)) modifier += parseInt(lonely[1], 10);

  // Apply adv/disadvantage to single d20 rolls only.
  if (adv && dice.length === 1 && dice[0].sides === 20) {
    const second = 1 + Math.floor(Math.random() * 20);
    const both = [dice[0].value, second].sort((a, b) => a - b);
    const keep = adv === "adv" ? both[1] : both[0];
    const drop = adv === "adv" ? both[0] : both[1];
    dice[0].value = keep;
    dice.push({ sides: 20, value: drop, dropped: true });
  }

  const total = dice.filter(d => !d.dropped).reduce((a, d) => a + d.value, 0) + modifier;

  // Build breakdown text.
  const liveDice = dice.filter(d => !d.dropped).map(d => Math.abs(d.value).toString());
  const dropped = dice.filter(d => d.dropped).map(d => `~~${d.value}~~`);
  const facePart = liveDice.length === 1 ? liveDice[0] : `[${liveDice.join(", ")}]`;
  const dropPart = dropped.length ? ` (${dropped.join(", ")})` : "";
  const modPart = modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
  const breakdown = `${facePart}${dropPart}${modPart} = ${total}`;

  // Crit/fumble for single d20.
  let crit = false, fumble = false;
  const live20 = dice.filter(d => !d.dropped && d.sides === 20);
  if (live20.length === 1) {
    if (live20[0].value === 20) crit = true;
    else if (live20[0].value === 1) fumble = true;
  }

  return { expression: expr, dice, modifier, total, breakdown, crit, fumble };
}

/** Format a roll for embedding in chat: `*🎲 2d6+3 = [4,5]+3 = 12*` */
export function formatRoll(r: RollResult): string {
  const flag = r.crit ? " ✦CRIT" : r.fumble ? " ✗FUMBLE" : "";
  return `*🎲 ${r.expression}: ${r.breakdown}${flag}*`;
}
