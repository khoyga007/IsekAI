import type { Provider } from "./types";
import { openAICompatStream } from "./openai-compat";

export const openai: Provider = {
  id: "openai",
  label: "OpenAI",
  needsKey: true,
  defaultModels: [
    { id: "gpt-4o", label: "GPT-4o", context: 128000, hint: "Flagship multimodal" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", context: 128000, hint: "Fast & cheap" },
    { id: "o1", label: "o1", context: 200000, hint: "Reasoning" },
    { id: "o1-mini", label: "o1-mini", context: 128000, hint: "Reasoning, cheaper" },
  ],
  stream: (req, cfg) => openAICompatStream("openai", "https://api.openai.com/v1", req, cfg),
};

export const deepseek: Provider = {
  id: "deepseek",
  label: "DeepSeek",
  needsKey: true,
  defaultModels: [
    { id: "deepseek-chat", label: "DeepSeek V3", context: 64000, hint: "General" },
    { id: "deepseek-reasoner", label: "DeepSeek R1", context: 64000, hint: "Reasoning" },
  ],
  stream: (req, cfg) => openAICompatStream("deepseek", "https://api.deepseek.com/v1", req, cfg),
};

export const openrouter: Provider = {
  id: "openrouter",
  label: "OpenRouter",
  needsKey: true,
  defaultModels: [
    { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", hint: "via OR" },
    { id: "openai/gpt-4o", label: "GPT-4o", hint: "via OR" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "via OR" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", hint: "open" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek V3", hint: "cheap" },
  ],
  stream: (req, cfg) =>
    openAICompatStream("openrouter", "https://openrouter.ai/api/v1", req, cfg, {
      "http-referer": "https://isekai.local",
      "x-title": "IsekAI",
    }),
};
