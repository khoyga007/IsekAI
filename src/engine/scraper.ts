import { smartFetch } from "@/providers/fetch";

/**
 * Fetches a wiki page and extracts readable text content.
 * Strategy:
 *  1. Wikipedia → use the REST `summary` API (clean, capped).
 *  2. Fandom    → fetch HTML, strip nav/sidebar/scripts, take main article.
 *  3. Anything else → naive HTML strip.
 *
 * Returns a compact text block (~3-6k chars) for the World Builder to digest.
 */
export async function scrapeUrl(url: string, signal?: AbortSignal): Promise<string> {
  const u = new URL(url);

  if (u.hostname === "en.wikipedia.org" || u.hostname.endsWith(".wikipedia.org")) {
    return await scrapeWikipedia(u, signal);
  }
  if (u.hostname.endsWith(".fandom.com")) {
    return await scrapeFandom(u, signal);
  }
  return await scrapeGeneric(u, signal);
}

async function scrapeWikipedia(u: URL, signal?: AbortSignal): Promise<string> {
  const slug = u.pathname.split("/").pop() ?? "";
  const apiUrl = `https://${u.hostname}/api/rest_v1/page/summary/${slug}`;
  const res = await smartFetch(apiUrl, { signal });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data: any = await res.json();
  const parts = [
    `# ${data.title ?? slug}`,
    data.description ? `*${data.description}*` : "",
    data.extract ?? "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

async function scrapeFandom(u: URL, signal?: AbortSignal): Promise<string> {
  const res = await smartFetch(u.toString(), { signal });
  if (!res.ok) throw new Error(`Fandom ${res.status}`);
  const html = await res.text();
  // Fandom main content sits inside .mw-parser-output. We grab everything
  // between that opening tag and the </main>/aside/footer marker.
  const main = html.match(/<div[^>]*class="[^"]*mw-parser-output[^"]*"[^>]*>([\s\S]*?)<\/main>/i)
            ?? html.match(/<div[^>]*class="[^"]*mw-parser-output[^"]*"[^>]*>([\s\S]*)/i);
  const body = main?.[1] ?? html;
  const titleMatch = html.match(/<h1[^>]*class="[^"]*page-header__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
                  ?? html.match(/<title>([^<]+)<\/title>/i);
  const title = stripTags(titleMatch?.[1] ?? u.pathname);
  return `# ${title}\n\n${stripWiki(body)}`.slice(0, 8000);
}

async function scrapeGeneric(u: URL, signal?: AbortSignal): Promise<string> {
  const res = await smartFetch(u.toString(), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = stripTags(titleMatch?.[1] ?? u.pathname);
  return `# ${title}\n\n${stripWiki(html)}`.slice(0, 6000);
}

function stripWiki(html: string): string {
  // Remove fandom/mediawiki noise: scripts, styles, navboxes, infoboxes (keep
  // the body of articles), references, edit buttons, etc.
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, "");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  s = s.replace(/<table[^>]*class="[^"]*(navbox|infobox|portable-infobox|metadata)[^"]*"[\s\S]*?<\/table>/gi, "");
  s = s.replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, "");
  s = s.replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[\s\S]*?<\/span>/gi, "");
  // Convert headings/paragraphs to text with breaks.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${"#".repeat(Number(n))} ${stripTags(t)}\n`);
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>(?!\n)/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = stripTags(s);
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
