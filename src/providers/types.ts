/**
 * Unified provider interface for IsekAI.
 * All providers normalize to this shape so the rest of the app
 * doesn't care whether tokens come from Anthropic, OpenAI, etc.
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "groq"
  | "mistral"
  | "xai"
  | "together"
  | "cerebras"
  | "zai"
  | "9router";

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  /** Hint that this message's content is stable across turns. Providers that
   *  support explicit caching (e.g. Anthropic cache_control) will mark it. */
  cache?: boolean;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Provider-specific extras (e.g. anthropic system, top_p). */
  extra?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ChatUsage {
  /** Total input tokens billed (includes cached portion). */
  inputTokens?: number;
  /** Output tokens generated. */
  outputTokens?: number;
  /** Subset of inputTokens that hit the prompt cache (charged at reduced rate). */
  cachedTokens?: number;
}

export interface ChatChunk {
  /** Incremental text delta. */
  delta: string;
  /** Set on the final chunk only. */
  done?: boolean;
  /** Optional usage info on final chunk. */
  usage?: ChatUsage;
}

export interface ProviderConfig {
  id: ProviderId;
  apiKey?: string;
  baseUrl?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  context?: number;
  hint?: string;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Models suggested in the picker; can be extended by user. */
  defaultModels: ModelInfo[];
  /** Whether this provider needs an API key. */
  needsKey: boolean;
  /** Streaming chat completion. Yields ChatChunk deltas. */
  stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<ChatChunk>;
}

export class ProviderError extends Error {
  constructor(public provider: ProviderId, public status: number | null, msg: string) {
    super(`[${provider}${status ? ` ${status}` : ""}] ${msg}`);
  }
}
