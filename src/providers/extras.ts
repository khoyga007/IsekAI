/**
 * Extra OpenAI-compatible providers.
 * Each wraps openAICompatStream with its own base URL + recommended models.
 * None of them honor Anthropic's cache_control — that path stays OpenRouter-only;
 * here the prefix-cache (if any) is server-side and automatic.
 */
import type { Provider } from "./types";
import { openAICompatStream } from "./openai-compat";

export const groq: Provider = {
  id: "groq",
  label: "Groq",
  needsKey: true,
  defaultModels: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", context: 128000, hint: "Fast & free tier" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", context: 128000, hint: "Ultra-fast" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", context: 32768, hint: "MoE classic" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B", context: 8192, hint: "Google open" },
  ],
  stream: (req, cfg) => openAICompatStream("groq", "https://api.groq.com/openai/v1", req, cfg),
};

export const mistral: Provider = {
  id: "mistral",
  label: "Mistral",
  needsKey: true,
  defaultModels: [
    { id: "mistral-large-latest", label: "Mistral Large", context: 128000, hint: "Flagship" },
    { id: "mistral-medium-latest", label: "Mistral Medium", context: 128000, hint: "Balanced" },
    { id: "mistral-small-latest", label: "Mistral Small", context: 128000, hint: "Cheap" },
    { id: "open-mistral-nemo", label: "Mistral Nemo", context: 128000, hint: "Open weights" },
  ],
  stream: (req, cfg) => openAICompatStream("mistral", "https://api.mistral.ai/v1", req, cfg),
};

export const xai: Provider = {
  id: "xai",
  label: "xAI Grok",
  needsKey: true,
  defaultModels: [
    { id: "grok-4", label: "Grok 4", context: 256000, hint: "Flagship" },
    { id: "grok-3", label: "Grok 3", context: 131072, hint: "Standard" },
    { id: "grok-3-mini", label: "Grok 3 Mini", context: 131072, hint: "Fast & cheap" },
  ],
  stream: (req, cfg) => openAICompatStream("xai", "https://api.x.ai/v1", req, cfg),
};

export const together: Provider = {
  id: "together",
  label: "Together AI",
  needsKey: true,
  defaultModels: [
    { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Turbo", context: 128000, hint: "Open & cheap" },
    { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B Turbo", context: 32768, hint: "Multilingual" },
    { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3", context: 64000, hint: "Open" },
    { id: "mistralai/Mixtral-8x22B-Instruct-v0.1", label: "Mixtral 8x22B", context: 65536, hint: "MoE" },
  ],
  stream: (req, cfg) => openAICompatStream("together", "https://api.together.xyz/v1", req, cfg),
};

export const cerebras: Provider = {
  id: "cerebras",
  label: "Cerebras",
  needsKey: true,
  defaultModels: [
    { id: "llama-3.3-70b", label: "Llama 3.3 70B", context: 128000, hint: "~2000 tok/s" },
    { id: "llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", context: 128000, hint: "Newest" },
    { id: "llama3.1-8b", label: "Llama 3.1 8B", context: 128000, hint: "Ultra-fast" },
  ],
  stream: (req, cfg) => openAICompatStream("cerebras", "https://api.cerebras.ai/v1", req, cfg),
};

export const zai: Provider = {
  id: "zai",
  label: "Z.ai (GLM)",
  needsKey: true,
  defaultModels: [
    { id: "glm-4.6", label: "GLM-4.6", context: 200000, hint: "Flagship" },
    { id: "glm-4-plus", label: "GLM-4 Plus", context: 128000, hint: "Standard" },
    { id: "glm-4-flash", label: "GLM-4 Flash", context: 128000, hint: "Free tier" },
  ],
  stream: (req, cfg) => openAICompatStream("zai", "https://api.z.ai/api/paas/v4", req, cfg),
};

export const nineRouter: Provider = {
  id: "9router",
  label: "9Router",
  needsKey: false,
  defaultModels: [
    { id: "auto", label: "Auto (best available)", hint: "9Router picks the best model" },
  ],
  stream: (req, cfg) => openAICompatStream("9router", cfg.baseUrl || "http://localhost:20128/v1", req, cfg),
};
