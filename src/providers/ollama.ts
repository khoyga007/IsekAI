import { smartFetch } from "./fetch";
import type { Provider, ProviderConfig, ChatRequest, ChatChunk } from "./types";
import { ProviderError } from "./types";
import { parseNDJSON } from "./sse";

const DEFAULT_BASE = "http://localhost:11434";

export const ollama: Provider = {
  id: "ollama",
  label: "Ollama (Local)",
  needsKey: false,
  defaultModels: [
    { id: "llama3.2", label: "Llama 3.2 (3B)", hint: "Lightweight" },
    { id: "llama3.1:8b", label: "Llama 3.1 8B", hint: "Solid local" },
    { id: "qwen2.5:14b", label: "Qwen 2.5 14B", hint: "Strong RP" },
    { id: "mistral-nemo", label: "Mistral Nemo", hint: "12B, 128k ctx" },
    { id: "deepseek-r1:14b", label: "DeepSeek R1 14B", hint: "Reasoning" },
  ],

  async *stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<ChatChunk> {
    const url = `${cfg.baseUrl ?? DEFAULT_BASE}/api/chat`;
    const res = await smartFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        options: {
          temperature: req.temperature,
          num_predict: req.maxTokens,
        },
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new ProviderError("ollama", res.status, await res.text());

    for await (const evt of parseNDJSON(res, req.signal)) {
      const delta = evt.message?.content ?? "";
      if (delta) yield { delta };
      if (evt.done) {
        yield {
          delta: "",
          done: true,
          usage: { inputTokens: evt.prompt_eval_count, outputTokens: evt.eval_count },
        };
      }
    }
  },
};
