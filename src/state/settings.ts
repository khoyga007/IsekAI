import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { ProviderId } from "@/providers";
import type { Lang } from "@/lib/i18n";

const STORE_FILE = "settings.json";

export interface ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface Settings {
  active: ProviderId;
  /** Optional secondary provider used when the primary fails (402, network, etc.). null = no fallback. */
  fallback: ProviderId | null;
  providers: Record<ProviderId, ProviderSettings>;
  ui: {
    /** Reduce ambient effects (motion, blur) for low-end machines. */
    lowFx: boolean;
    /** Ambient audio toggle. */
    audio: boolean;
    /** Master volume 0..1. */
    audioVolume: number;
    /** UI language. */
    lang: Lang;
    /** Reveal AI text character-by-character while streaming. */
    typewriter: boolean;
  };
}

const DEFAULT: Settings = {
  active: "anthropic",
  fallback: null,
  providers: {
    anthropic: { model: "claude-sonnet-4-6" },
    openai: { model: "gpt-4o" },
    google: { model: "gemini-2.5-pro" },
    openrouter: { model: "anthropic/claude-sonnet-4.6" },
    deepseek: { model: "deepseek-chat" },
    groq: { model: "llama-3.3-70b-versatile" },
    mistral: { model: "mistral-large-latest" },
    xai: { model: "grok-3-mini" },
    together: { model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" },
    cerebras: { model: "llama-3.3-70b" },
    zai: {},
    "9router": { model: "auto", baseUrl: "http://localhost:20128/v1" },
    ollama: { model: "llama3.2:3b", baseUrl: "http://localhost:11434" },
    mock: { model: "mock:happy" },
  },
  ui: { lowFx: false, audio: false, audioVolume: 0.18, lang: "vi", typewriter: true },
};

interface SettingsStore extends Settings {
  hydrated: boolean;
  hydrate(): Promise<void>;
  setActive(id: ProviderId): void;
  setFallback(id: ProviderId | null): void;
  setProvider(id: ProviderId, patch: Partial<ProviderSettings>): void;
  setLowFx(v: boolean): void;
  setAudio(v: boolean): void;
  setAudioVolume(v: number): void;
  setLang(v: Lang): void;
  setTypewriter(v: boolean): void;
}

let _store: LazyStore | null = null;
function store() {
  if (!_store) _store = new LazyStore(STORE_FILE);
  return _store;
}

async function persist(state: Settings) {
  const s = store();
  await s.set("settings", state);
  await s.save();
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT,
  hydrated: false,

  async hydrate() {
    try {
      const s = store();
      const loaded = await s.get<Settings>("settings");
      if (loaded) {
        set({ ...DEFAULT, ...loaded, providers: { ...DEFAULT.providers, ...loaded.providers }, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setActive(id) {
    // Selecting a provider as primary clears it from fallback to avoid loops.
    const fallback = get().fallback === id ? null : get().fallback;
    set({ active: id, fallback });
    void persist({ ...get() });
  },

  setFallback(id) {
    // Disallow same provider as both primary and fallback.
    if (id === get().active) return;
    set({ fallback: id });
    void persist({ ...get() });
  },

  setProvider(id, patch) {
    const next = {
      ...get().providers,
      [id]: { ...get().providers[id], ...patch },
    };
    set({ providers: next });
    void persist({ ...get(), providers: next });
  },

  setLowFx(v) {
    const ui = { ...get().ui, lowFx: v };
    set({ ui });
    void persist({ ...get(), ui });
  },

  setAudio(v) {
    const ui = { ...get().ui, audio: v };
    set({ ui });
    void persist({ ...get(), ui });
  },

  setAudioVolume(v) {
    const ui = { ...get().ui, audioVolume: v };
    set({ ui });
    void persist({ ...get(), ui });
  },

  setLang(v) {
    const ui = { ...get().ui, lang: v };
    set({ ui });
    void persist({ ...get(), ui });
  },

  setTypewriter(v) {
    const ui = { ...get().ui, typewriter: v };
    set({ ui });
    void persist({ ...get(), ui });
  },
}));
