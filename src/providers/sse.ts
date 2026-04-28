/**
 * Minimal Server-Sent-Events parser for streaming responses.
 * Works with any fetch ReadableStream; yields data payloads as strings.
 */
export async function* parseSSE(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      let dataChunks: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataChunks.push(line.slice(5).trimStart());
        } else if (line === "") {
          if (dataChunks.length) {
            yield dataChunks.join("\n");
            dataChunks = [];
          }
        }
      }
      if (dataChunks.length) {
        // partial event still buffered; push back as buffer continuation
        buffer = dataChunks.map((d) => `data: ${d}`).join("\n") + "\n" + buffer;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse newline-delimited JSON streams (used by Ollama).
 */
export async function* parseNDJSON(res: Response, signal?: AbortSignal): AsyncGenerator<any> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try { yield JSON.parse(t); } catch { /* ignore */ }
      }
    }
    if (buffer.trim()) {
      try { yield JSON.parse(buffer); } catch { /* ignore */ }
    }
  } finally {
    reader.releaseLock();
  }
}
