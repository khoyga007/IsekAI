/**
 * Character avatar acquisition.
 *
 * Single source:
 *   - **AniList GraphQL** — for canon characters. Free public API, no auth,
 *     stable CDN-hosted images. Best for known manga/LN/anime.
 *
 * Produces plain `https://...` URLs that can be passed directly to an
 * <img> tag. We persist the URL into Campaign data; AniList CDN URLs are
 * effectively permanent. Characters without a canon match fall back to the
 * procedural initials sigil (see lib/avatar.tsx) — zero cost, zero network.
 *
 * AI image generation (Pollinations.ai, Google Nano Banana) was removed
 * 2026-06-12 to keep the app strictly free to run.
 */

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
 * Normalize a character name into comparable word tokens. AniList stores
 * full names in given-name-first order ("Luffy Monkey", "Zoro Roronoa")
 * while LLM-written bibles use the conventional order ("Monkey D. Luffy",
 * "Roronoa Zoro") — so all comparisons must be ORDER-INSENSITIVE.
 * Punctuation ("D.", apostrophes, hyphens) is stripped to whitespace.
 */
function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,'"’´`\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Find the best AniList character match for `name` within a fetched cast.
 * Compares against `name` + `alternative` aliases using order-insensitive
 * token sets, with subset / single-token fallbacks.
 */
export function matchCanonAvatar(name: string, cast: AniListCharacter[]): string | null {
  if (!name || cast.length === 0) return null;
  const target = nameTokens(name);
  if (target.length === 0) return null;
  const targetSet = new Set(target);

  const img = (c: AniListCharacter) => c.imageLarge ?? c.imageMedium ?? null;
  const aliases = (c: AniListCharacter) => [c.name, ...c.alternatives].map(nameTokens).filter((t) => t.length > 0);

  // 1. Same token set, any order ("Roronoa Zoro" ↔ "Zoro Roronoa", "Monkey D. Luffy" ↔ "Luffy Monkey D").
  for (const c of cast) {
    if (aliases(c).some((t) => t.length === targetSet.size && t.every((w) => targetSet.has(w)))) return img(c);
  }
  // 2. Subset either way ("Frieren" ⊂ "Frieren the Slayer"; "Monkey D Luffy" ⊃ "Luffy Monkey").
  for (const c of cast) {
    for (const t of aliases(c)) {
      const tSet = new Set(t);
      if (t.every((w) => targetSet.has(w)) || target.every((w) => tSet.has(w))) return img(c);
    }
  }
  // 3. Shared distinctive token ("Edward Elric" → "Elric Edward" already caught; this
  //    catches "Captain Levi" vs "Levi Ackerman"). Skip 1-2 char tokens ("d", initials).
  for (const c of cast) {
    for (const t of aliases(c)) {
      if (t.some((w) => w.length >= 3 && targetSet.has(w))) return img(c);
    }
  }
  return null;
}

/**
 * Decide whether a Source kind implies the cast is canon (worth trying AniList)
 * or fully OC (no canon lookup possible — sigils only).
 */
export function isCanonSource(sourceKind: "title" | "world" | "url" | "rng"): boolean {
  return sourceKind === "title" || sourceKind === "url";
}
