/**
 * Character avatar acquisition.
 *
 * Two sources, used in tandem:
 *   - **AniList GraphQL** — for canon characters. Free public API, no auth,
 *     stable CDN-hosted images. Best for known manga/LN/anime.
 *   - **Pollinations.ai** — free, anonymous, on-demand image generation.
 *     The URL is the prompt; the image is generated lazily on first GET.
 *     Used for OC characters or as a fallback when AniList misses.
 *
 * Both produce plain `https://...` URLs that can be passed directly to an
 * <img> tag. We persist the URL into Campaign data; AniList CDN URLs are
 * effectively permanent, and Pollinations URLs are deterministic by
 * (prompt, seed, model) so re-fetching gives the same image.
 */

import type { WorldBible } from "@/state/types";

/* ============================================================
 * AniList — fetch character images for a known media title
 * ============================================================ */

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

interface AniListCharacter {
  name: string;
  alternatives: string[];
  imageLarge?: string;
  imageMedium?: string;
}

/**
 * Search AniList for a media title and return all of its characters with images.
 * Tries MANGA, then ANIME, then NOVEL — first non-empty hit wins. We pull the
 * top-matching media and its character list; we do NOT do per-character search
 * because that often returns wrong characters from unrelated works.
 */
export async function fetchAniListCast(mediaTitle: string, signal?: AbortSignal): Promise<AniListCharacter[]> {
  if (!mediaTitle.trim()) return [];

  const query = `
    query ($search: String, $type: MediaType) {
      Page(perPage: 1) {
        media(search: $search, type: $type, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          characters(perPage: 50, sort: [ROLE, FAVOURITES_DESC]) {
            nodes {
              name { full alternative }
              image { large medium }
            }
          }
        }
      }
    }
  `;

  for (const type of ["MANGA", "ANIME", "NOVEL"] as const) {
    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables: { search: mediaTitle, type } }),
        signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      const media = json?.data?.Page?.media?.[0];
      if (!media) continue;
      const nodes: any[] = media.characters?.nodes ?? [];
      if (nodes.length === 0) continue;
      return nodes.map((n) => ({
        name: n.name?.full ?? "",
        alternatives: (n.name?.alternative ?? []).filter(Boolean),
        imageLarge: n.image?.large,
        imageMedium: n.image?.medium,
      }));
    } catch (_) {
      // try next media type
    }
  }
  return [];
}

/**
 * Find the best AniList character match for `name` within a fetched cast.
 * Compares against `name` + `alternative` aliases case-insensitively, with
 * fuzzy fallback (substring + last-name match).
 */
export function matchCanonAvatar(name: string, cast: AniListCharacter[]): string | null {
  if (!name || cast.length === 0) return null;
  const target = name.toLowerCase().trim();
  const targetParts = target.split(/\s+/);

  // Exact full-name match.
  for (const c of cast) {
    if (c.name.toLowerCase() === target) return c.imageLarge ?? c.imageMedium ?? null;
    if (c.alternatives.some((a) => a.toLowerCase() === target)) return c.imageLarge ?? c.imageMedium ?? null;
  }
  // Substring match (handles "Frieren" matching "Frieren the Slayer").
  for (const c of cast) {
    const nm = c.name.toLowerCase();
    if (nm.includes(target) || target.includes(nm)) return c.imageLarge ?? c.imageMedium ?? null;
    if (c.alternatives.some((a) => a.toLowerCase().includes(target))) return c.imageLarge ?? c.imageMedium ?? null;
  }
  // Last-name match for multi-word names (e.g. "Edward Elric" → "Elric").
  if (targetParts.length > 1) {
    const last = targetParts[targetParts.length - 1];
    for (const c of cast) {
      const parts = c.name.toLowerCase().split(/\s+/);
      if (parts[parts.length - 1] === last) return c.imageLarge ?? c.imageMedium ?? null;
    }
  }
  return null;
}

/* ============================================================
 * Google Nano Banana (Gemini Image) — high-quality, requires API key
 * ============================================================ */

/**
 * Default model id for "Nano Banana 2" — Google's Gemini image generator.
 * Stable as of late 2025. Can be overridden via opts.model when newer
 * variants ship (e.g. gemini-3-flash-image).
 */
const NANO_BANANA_MODEL = "gemini-2.5-flash-image";

/**
 * Generate a single image via Google's Gemini image API ("Nano Banana").
 * Returns a `data:image/png;base64,...` URL that's persistable to the
 * campaign and renders directly in <img>. Costs ~$0.04 per image at the
 * time of writing — caller should weigh against the free Pollinations path.
 */
export async function generateNanoBananaImage(
  prompt: string,
  apiKey: string,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const model = opts.model ?? NANO_BANANA_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch { /* keep status */ }
    throw new Error(`Nano Banana ${msg}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      const mime = p.inlineData.mimeType || "image/png";
      return `data:${mime};base64,${p.inlineData.data}`;
    }
  }
  throw new Error("Nano Banana returned no image");
}

/**
 * Fire N parallel Nano Banana generations for the same prompt. Returns an
 * array of length N; each entry is a promise that resolves to a data URL
 * (or rejects on error). Caller is expected to swallow/log individual
 * failures rather than failing the whole batch — one bad gen shouldn't
 * kill the picker.
 */
export function generateNanoBananaCandidates(
  prompt: string,
  count: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string>[] {
  const out: Promise<string>[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateNanoBananaImage(prompt, apiKey, { signal }));
  }
  return out;
}

/* ============================================================
 * Pollinations.ai — on-demand image generation, no API key
 * ============================================================ */

const POLLINATIONS_ENDPOINT = "https://image.pollinations.ai/prompt";

export interface GenOptions {
  /** Random seed; varying it produces a different image for the same prompt. */
  seed?: number;
  /** Image dimensions. Defaults to 512×512 (square portrait). */
  width?: number;
  height?: number;
  /** Pollinations model. "flux" gives the best quality at the time of writing. */
  model?: "flux" | "turbo" | "flux-realism" | "flux-anime";
}

/**
 * Build a deterministic Pollinations.ai URL. The same (prompt, seed, model)
 * always returns the same image, so we can persist this URL safely without
 * downloading bytes — re-fetching regenerates identically.
 *
 * Notes on params we deliberately keep MINIMAL:
 *   - We pass NO `model=` param so Pollinations picks its current default
 *     (avoids 404s when a named model is renamed/deprecated).
 *   - We strip diacritics and clip prompt length to keep URL well under
 *     ~2000 chars, which Webview2 / Edge handles reliably.
 */
export function pollinationsUrl(prompt: string, opts: GenOptions = {}): string {
  const seed = opts.seed ?? 1;
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  // Pollinations is sensitive to long URL-encoded prompts. Strip diacritics
  // and clip to ~280 chars to keep things sane.
  const safe = stripDiacritics(prompt).slice(0, 280);
  const enc = encodeURIComponent(safe);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: "true",
  });
  if (opts.model) params.set("model", opts.model);
  return `${POLLINATIONS_ENDPOINT}/${enc}?${params.toString()}`;
}

/** Remove combining marks so Vietnamese / Japanese romaji prompts encode cleanly. */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Build a portrait prompt for a character given the world's tone + character desc.
 * Style hints are biased toward anime/manga to match the app's aesthetic.
 */
export function buildPortraitPrompt(args: {
  name: string;
  description: string;
  role?: string;
  worldTone?: string;
  worldGenre?: string;
}): string {
  const tone = args.worldTone || "";
  const genre = args.worldGenre || "";
  const styleHint = pickStyleHint(genre, tone);
  // Strip pronouns / overly long descriptions to keep prompt tight.
  const desc = (args.description || "").replace(/\s+/g, " ").trim().slice(0, 220);
  const role = args.role ? `, ${args.role}` : "";
  return [
    `anime portrait of ${args.name}${role}`,
    desc,
    styleHint,
    "character bust shot, soft lighting, detailed face, manga art style, expressive eyes",
  ].filter(Boolean).join(", ");
}

function pickStyleHint(genre: string, tone: string): string {
  const g = genre.toLowerCase();
  const t = tone.toLowerCase();
  if (g.includes("cyberpunk") || g.includes("noir")) return "cyberpunk noir, neon-lit, gritty, cinematic";
  if (g.includes("horror") || t.includes("grim")) return "dark fantasy, moody atmosphere, dramatic shadows";
  if (g.includes("romance") || g.includes("school")) return "shojo manga style, soft palette, warm light";
  if (g.includes("isekai") || g.includes("fantasy")) return "fantasy isekai, ornate clothing, painterly background";
  if (g.includes("mecha") || g.includes("sci-fi")) return "sci-fi mecha, futuristic, sharp linework";
  if (g.includes("post-apoc")) return "post-apocalyptic, dust and ash, weathered look";
  return "high quality manga illustration, vibrant detailed";
}

/**
 * Generate N candidate Pollinations URLs for the same prompt with different seeds.
 * The user picks one (or none) in AvatarPicker. If `extraSeedOffset` is given,
 * we shift the seed range — useful for "regenerate" producing fresh candidates.
 */
export function generateCandidates(prompt: string, count = 4, extraSeedOffset = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pollinationsUrl(prompt, { seed: 1 + i + extraSeedOffset * count }));
  }
  return out;
}

/* ============================================================
 * High-level: gather candidates for every character in a bible
 * ============================================================ */

export interface CharacterCandidates {
  /** Index in bible.keyCharacters, or -1 for the protagonist. */
  charIdx: number;
  /** Character name (for display). */
  name: string;
  /** Best-effort current avatar (if any was already set). */
  current?: string;
  /** Image URLs the user can pick from. AniList comes first if found. */
  candidates: string[];
}

/**
 * Decide whether a Source kind implies the cast is canon (worth trying AniList)
 * or fully OC (skip AniList, go straight to gen).
 */
export function isCanonSource(sourceKind: "title" | "world" | "url" | "rng"): boolean {
  return sourceKind === "title" || sourceKind === "url";
}

/**
 * Build initial candidate list for one character: 1-2 AniList matches (if canon)
 * + several Pollinations gens. Returns up to ~5 URLs.
 */
export function buildInitialCandidates(args: {
  name: string;
  description: string;
  role?: string;
  bible: Pick<WorldBible, "tone" | "genre">;
  anilistCast: AniListCharacter[];
  isCanon: boolean;
}): string[] {
  const out: string[] = [];
  if (args.isCanon) {
    const hit = matchCanonAvatar(args.name, args.anilistCast);
    if (hit) out.push(hit);
  }
  const prompt = buildPortraitPrompt({
    name: args.name,
    description: args.description,
    role: args.role,
    worldGenre: args.bible.genre,
    worldTone: args.bible.tone,
  });
  // 4 gen candidates with varied seeds.
  out.push(...generateCandidates(prompt, 4, 0));
  return out;
}
