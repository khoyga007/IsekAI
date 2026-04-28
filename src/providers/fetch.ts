import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Smart fetch wrapper.
 *
 * In Tauri (desktop) the HTTP plugin sends requests through the Rust side,
 * bypassing browser CORS — every provider works. In a plain browser preview
 * (vite dev), the plugin throws because the Tauri runtime is absent. We
 * detect that and fall back to native window.fetch — at the cost of CORS,
 * which only Gemini/OpenRouter/Ollama allow from a browser origin.
 *
 * Callers don't need to care; they always get a Response.
 */
const inTauri = typeof (window as any).__TAURI_INTERNALS__ !== "undefined"
            || typeof (window as any).__TAURI__ !== "undefined";

export async function smartFetch(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  if (inTauri) {
    try {
      return await tauriFetch(url, init as any);
    } catch (e) {
      // tauriFetch threw — fall through to native fetch.
      void e;
    }
  }
  return await fetch(url, init);
}
