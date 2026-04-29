import type { Provider, ProviderId } from "./types";
import { anthropic } from "./anthropic";
import { openai, deepseek, openrouter } from "./openai";
import { google } from "./google";
import { ollama } from "./ollama";
import { groq, mistral, xai, together, cerebras, zai, nineRouter } from "./extras";
import { mock } from "./mock";

export * from "./types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic,
  openai,
  google,
  openrouter,
  deepseek,
  groq,
  mistral,
  xai,
  together,
  cerebras,
  zai,
  "9router": nineRouter,
  ollama,
  mock,
};

export const PROVIDER_LIST: Provider[] = [
  anthropic,
  openai,
  google,
  openrouter,
  deepseek,
  groq,
  mistral,
  xai,
  together,
  cerebras,
  zai,
  nineRouter,
  ollama,
  mock,
];

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}
