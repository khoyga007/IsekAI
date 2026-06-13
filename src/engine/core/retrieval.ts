import type { Campaign, Scene } from "@/state/types";
import { panelsToCompact } from "./streamParser";

/* ---------- Lexical retrieval over archived scenes (local RAG) ----------
 *
 * Context compression archives old scenes; the model only keeps a 3-5
 * sentence crystal. When something from deep history becomes relevant
 * again (an NPC returns, the player mentions an old promise), we pull the
 * most relevant archived scenes back verbatim into the dynamic block.
 *
 * Pure lexical scoring — no embeddings, no API, no cost. Proper nouns are
 * the anchor: RP text is dense with character/faction/place names, and a
 * name match is a far stronger relevance signal than shared common words,
 * so bible-known name tokens score 3x.
 */

// Common words that carry no retrieval signal (EN + VN). Small on purpose —
// over-aggressive stopword lists hurt Vietnamese, where many short words
// are content-bearing.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "is", "are",
  "was", "were", "it", "its", "you", "your", "i", "my", "me", "he", "him",
  "his", "she", "her", "they", "them", "we", "us", "with", "for", "that",
  "this", "what", "when", "where", "how", "not", "no", "but", "as", "from",
  "và", "của", "là", "có", "không", "anh", "em", "tôi", "ta", "một", "này",
  "đó", "cái", "đi", "được", "trong", "với", "cho", "nói", "nhìn", "rồi",
  "thì", "mà", "như", "lại", "cũng", "vẫn", "đã", "sẽ", "đang", "ở", "ra",
  "vào", "lên", "xuống", "người", "gì", "ai", "nào", "về", "còn", "bị",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/** Tokens from every name the bible knows — protagonist, key characters,
 *  factions. These get the 3x relevance weight. */
function nameTokens(c: Campaign): Set<string> {
  const names = [
    c.protagonist?.name ?? "",
    ...(c.bible?.keyCharacters ?? []).map(k => k.name),
    ...(c.bible?.factions ?? []).map(f => f.name),
  ];
  const out = new Set<string>();
  for (const n of names) for (const t of tokenize(n)) out.add(t);
  return out;
}

function sceneText(s: Scene): string {
  const inp = s.playerInput ? `${s.playerInput.text} ` : "";
  return inp + panelsToCompact(s.panels);
}

const NAME_WEIGHT = 3;
// A scene must clear this to be recalled at all. One name hit (3) plus one
// supporting common token (1) is the floor; pure common-word overlap needs
// to be substantial. Generic inputs ("I attack", "tôi bỏ chạy") stay below
// it, so quiet turns inject nothing and cost nothing.
const MIN_SCORE = 4;

export interface RecalledScene {
  scene: Scene;
  score: number;
}

/**
 * Tokenizing every archived scene + building the document-frequency map runs
 * once per turn, but the archive only changes when compression fires (every
 * ~8 turns, adding a chunk to the front). Cache the heavy part keyed by the
 * archived id set; a campaign with 50+ archived scenes then re-tokenizes only
 * on the rare turn the set actually grows.
 */
let dfCache: { key: string; tokensPerScene: Set<string>[]; df: Map<string, number> } | null = null;

function archiveIndex(archived: Scene[]): { tokensPerScene: Set<string>[]; df: Map<string, number> } {
  const key = archived.map(s => s.id).join("|");
  if (dfCache && dfCache.key === key) return dfCache;
  const tokensPerScene = archived.map(s => new Set(tokenize(sceneText(s))));
  const df = new Map<string, number>();
  for (const tokens of tokensPerScene) {
    for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
  }
  dfCache = { key, tokensPerScene, df };
  return dfCache;
}

/**
 * Score archived scenes against a query (player input + latest scene) and
 * return the best ones, capped by an estimated token budget.
 */
export function recallArchivedScenes(
  c: Campaign,
  queryText: string,
  maxTokens = 1000,
): RecalledScene[] {
  const archived = (c.scenes ?? []).filter(s => s.archived);
  if (archived.length === 0) return [];

  const query = new Set(tokenize(queryText));
  if (query.size === 0) return [];
  const names = nameTokens(c);

  // The query includes the whole latest scene, so it's hundreds of tokens —
  // raw overlap would match every archived scene. Only tokens that are RARE
  // across the archive carry signal: a word present in most old scenes
  // ("sword", "chạy") says nothing about which scene is relevant. Names
  // always count, and at triple weight. (tokensPerScene + df are cached.)
  const { tokensPerScene, df } = archiveIndex(archived);
  const rareCutoff = Math.max(1, Math.ceil(archived.length * 0.25));

  const scored: RecalledScene[] = [];
  archived.forEach((s, i) => {
    const tokens = tokensPerScene[i];
    let score = 0;
    for (const q of query) {
      if (!tokens.has(q)) continue;
      // A name in EVERY archived scene (the protagonist, usually) carries
      // no signal either — it would add a flat +3 to everything.
      if (names.has(q) && (df.get(q) ?? 0) < archived.length) score += NAME_WEIGHT;
      else if (!names.has(q) && (df.get(q) ?? 0) <= rareCutoff) score += 1;
    }
    if (score >= MIN_SCORE) scored.push({ scene: s, score });
  });

  scored.sort((a, b) => b.score - a.score || b.scene.turn - a.scene.turn);

  // Greedy fill within the token budget (~4 chars/token, same estimator as
  // contextManager), then chronological order for readability.
  const picked: RecalledScene[] = [];
  let budget = maxTokens;
  for (const r of scored) {
    const cost = Math.ceil(sceneText(r.scene).length / 4);
    if (cost > budget) continue;
    picked.push(r);
    budget -= cost;
    if (picked.length >= 5 || budget <= 0) break;
  }
  picked.sort((a, b) => a.scene.turn - b.scene.turn);
  return picked;
}

/** Format recalled scenes as a system-prompt section. "" when nothing hit. */
export function formatRecalledScenes(recalled: RecalledScene[]): string {
  if (recalled.length === 0) return "";
  const body = recalled
    .map(r => `[T${r.scene.turn}] ${sceneText(r.scene)}`)
    .join("\n---\n");
  return `═══ RECALLED SCENES (verbatim from earlier in this campaign — events the GM must stay consistent with) ═══\n${body}`;
}
