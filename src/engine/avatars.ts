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

/**
 * Decide whether a Source kind implies the cast is canon (worth trying AniList)
 * or fully OC (no canon lookup possible — sigils only).
 */
export function isCanonSource(sourceKind: "title" | "world" | "url" | "rng"): boolean {
  return sourceKind === "title" || sourceKind === "url";
}
