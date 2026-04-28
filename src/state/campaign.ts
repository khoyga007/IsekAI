import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { nanoid } from "nanoid";
import type { Campaign, Scene, Panel, HudSchema, MemoryCrystal, SavePoint } from "./types";
import type { ChatUsage, ProviderId } from "@/providers";

const STORE_FILE = "campaigns.json";

/** Lightweight summary used in the library list (avoids loading full scenes). */
export interface CampaignSummary {
  id: string;
  title: string;
  genre: string;
  protagonist: string;
  turns: number;
  updatedAt: number;
}

interface CampaignStore {
  current: Campaign | null;
  /** Indexed library — id -> summary. Full campaigns persisted under `c:<id>`. */
  library: Record<string, CampaignSummary>;
  /** True while we're streaming a turn. */
  streaming: boolean;
  /** Buffer for the in-progress assistant scene. */
  draft: { panels: Panel[]; raw: string } | null;
  /** Token usage from the most recent completed turn. Transient — not persisted. */
  lastUsage: ChatUsage | null;
  setLastUsage(u: ChatUsage): void;
  /** Set briefly when a fallback provider was used. UI clears it after a few seconds. */
  lastFallback: { from: ProviderId; to: ProviderId; at: number } | null;
  setLastFallback(f: { from: ProviderId; to: ProviderId } | null): void;

  hydrate(): Promise<void>;
  start(c: Campaign): Promise<void>;
  load(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  closeCampaign(): void;

  beginTurn(): void;
  appendDraftRaw(chunk: string): void;
  setDraftPanels(panels: Panel[]): void;
  commitTurn(input?: Scene["playerInput"], hudPatch?: Scene["hudPatch"], meta?: { suggestions?: string[]; mood?: string; beat?: string }): Promise<void>;

  /** Update a single panel inside a committed scene (text fix, voice tweak). */
  updatePanel(sceneIdx: number, panelIdx: number, updates: Partial<Panel>): Promise<void>;
  patchHud(updates: Partial<HudSchema>): Promise<void>;
  addCrystal(c: Omit<MemoryCrystal, "id">): Promise<void>;
  /** Pop the last committed scene (and any crystals tied to it). Returns the
   *  player input from that scene so callers can re-stuff the input bar. */
  undoLastScene(): Promise<{ mode: "say" | "do" | "think" | "ooc"; text: string } | null>;
  /** Persist current campaign without changing scenes (used after HUD ops). */
  saveCurrent(): Promise<void>;

  /* --- Save points --- */
  /** Pin a bookmark at the current scene. */
  bookmark(label: string): Promise<SavePoint | null>;
  /** Rewind the active campaign to a bookmark (drops scenes/crystals after). */
  restoreBookmark(id: string): Promise<void>;
  /** Fork a bookmark into a brand-new campaign and switch to it. */
  branchBookmark(id: string): Promise<void>;
  /** Remove a bookmark (does not affect scenes). */
  deleteBookmark(id: string): Promise<void>;
}

let _store: LazyStore | null = null;
function store() {
  if (!_store) _store = new LazyStore(STORE_FILE);
  return _store;
}

function summarize(c: Campaign): CampaignSummary {
  return {
    id: c.id,
    title: c.bible.title,
    genre: c.bible.genre,
    protagonist: c.protagonist.name,
    turns: c.scenes.length,
    updatedAt: c.updatedAt,
  };
}

async function persistCampaign(c: Campaign) {
  const s = store();
  await s.set(`c:${c.id}`, c);
  const lib = ((await s.get<Record<string, CampaignSummary>>("library")) ?? {});
  lib[c.id] = summarize(c);
  await s.set("library", lib);
  await s.set("activeId", c.id);
  await s.save();
}

export const useCampaign = create<CampaignStore>((set, get) => ({
  current: null,
  library: {},
  streaming: false,
  draft: null,
  lastUsage: null,
  setLastUsage(u) { set({ lastUsage: u }); },
  lastFallback: null,
  setLastFallback(f) {
    set({ lastFallback: f ? { ...f, at: Date.now() } : null });
  },

  async hydrate() {
    try {
      const s = store();
      const lib = (await s.get<Record<string, CampaignSummary>>("library")) ?? {};
      const activeId = await s.get<string>("activeId");
      let current: Campaign | null = null;
      if (activeId && lib[activeId]) {
        current = (await s.get<Campaign>(`c:${activeId}`)) ?? null;
      }
      set({ library: lib, current });
    } catch { /* ignore */ }
  },

  async start(c) {
    set({ current: c, draft: null, streaming: false, lastUsage: null, lastFallback: null });
    await persistCampaign(c);
    set({ library: { ...get().library, [c.id]: summarize(c) } });
  },

  async load(id) {
    const s = store();
    const c = await s.get<Campaign>(`c:${id}`);
    if (!c) return;
    await s.set("activeId", id);
    await s.save();
    set({ current: c, draft: null, streaming: false, lastUsage: null, lastFallback: null });
  },

  async remove(id) {
    const s = store();
    await s.delete(`c:${id}`);
    const lib = { ...get().library };
    delete lib[id];
    await s.set("library", lib);
    if (get().current?.id === id) {
      await s.delete("activeId");
      set({ current: null, draft: null, streaming: false });
    }
    await s.save();
    set({ library: lib });
  },

  closeCampaign() {
    set({ current: null, draft: null, streaming: false, lastUsage: null });
    void store().delete("activeId").then(() => store().save());
  },

  beginTurn() {
    set({ streaming: true, draft: { panels: [], raw: "" } });
  },

  appendDraftRaw(chunk) {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, raw: d.raw + chunk } });
  },

  setDraftPanels(panels) {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, panels } });
  },

  async commitTurn(input, hudPatch, meta) {
    const cur = get().current;
    const draft = get().draft;
    if (!cur || !draft) return;
    const scene: Scene = {
      id: nanoid(8),
      turn: cur.scenes.length,
      playerInput: input,
      panels: draft.panels,
      hudPatch,
      suggestions: meta?.suggestions?.length ? meta.suggestions : undefined,
      mood: meta?.mood,
      beat: meta?.beat,
    };
    const next: Campaign = {
      ...cur,
      scenes: [...cur.scenes, scene],
      updatedAt: Date.now(),
    };
    set({ current: next, draft: null, streaming: false, library: { ...get().library, [next.id]: summarize(next) } });
    await persistCampaign(next);
  },

  async updatePanel(sceneIdx, panelIdx, updates) {
    const cur = get().current;
    if (!cur) return;
    const scenes = [...cur.scenes];
    const scene = scenes[sceneIdx];
    if (!scene) return;
    const panels = [...scene.panels];
    const panel = panels[panelIdx];
    if (!panel) return;
    panels[panelIdx] = { ...panel, ...updates };
    scenes[sceneIdx] = { ...scene, panels };
    const next = { ...cur, scenes, updatedAt: Date.now() };
    set({ current: next });
    await persistCampaign(next);
  },

  async patchHud(updates) {
    const cur = get().current;
    if (!cur) return;
    const next = { ...cur, hud: { ...cur.hud, ...updates }, updatedAt: Date.now() };
    set({ current: next });
    await persistCampaign(next);
  },

  async addCrystal(c) {
    const cur = get().current;
    if (!cur) return;
    const crystal: MemoryCrystal = { ...c, id: nanoid(6) };
    const next = { ...cur, crystals: [...cur.crystals, crystal], updatedAt: Date.now() };
    set({ current: next });
    await persistCampaign(next);
  },

  async undoLastScene() {
    const cur = get().current;
    if (!cur || cur.scenes.length === 0) return null;
    const last = cur.scenes[cur.scenes.length - 1];
    const next: Campaign = {
      ...cur,
      scenes: cur.scenes.slice(0, -1),
      // Drop crystals pinned at-or-after the popped turn — they were
      // attached to the now-erased scene.
      crystals: cur.crystals.filter(c => c.turn < last.turn),
      updatedAt: Date.now(),
    };
    set({ current: next, library: { ...get().library, [next.id]: summarize(next) } });
    await persistCampaign(next);
    return last.playerInput ?? null;
  },

  async saveCurrent() {
    const cur = get().current;
    if (!cur) return;
    await persistCampaign(cur);
    set({ library: { ...get().library, [cur.id]: summarize(cur) } });
  },

  async bookmark(label) {
    const cur = get().current;
    if (!cur) return null;
    // Strip bookmarks from snapshot to avoid recursive growth.
    const { bookmarks: _b, ...rest } = cur;
    void _b;
    const sp: SavePoint = {
      id: nanoid(6),
      label: label.trim() || `Turn ${cur.scenes.length}`,
      createdAt: Date.now(),
      turn: cur.scenes.length,
      snapshot: rest,
    };
    const next: Campaign = {
      ...cur,
      bookmarks: [...(cur.bookmarks ?? []), sp],
      updatedAt: Date.now(),
    };
    set({ current: next });
    await persistCampaign(next);
    return sp;
  },

  async restoreBookmark(id) {
    const cur = get().current;
    if (!cur) return;
    const sp = (cur.bookmarks ?? []).find(b => b.id === id);
    if (!sp) return;
    // Rewind scenes/crystals, but keep the bookmark list intact.
    const next: Campaign = {
      ...sp.snapshot,
      bookmarks: cur.bookmarks,
      updatedAt: Date.now(),
    };
    set({ current: next, draft: null, streaming: false, library: { ...get().library, [next.id]: summarize(next) } });
    await persistCampaign(next);
  },

  async branchBookmark(id) {
    const cur = get().current;
    if (!cur) return;
    const sp = (cur.bookmarks ?? []).find(b => b.id === id);
    if (!sp) return;
    const newId = nanoid(10);
    const branched: Campaign = {
      ...sp.snapshot,
      id: newId,
      bible: { ...sp.snapshot.bible, title: `${sp.snapshot.bible.title} (branch)` },
      bookmarks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ current: branched, draft: null, streaming: false, library: { ...get().library, [branched.id]: summarize(branched) } });
    await persistCampaign(branched);
  },

  async deleteBookmark(id) {
    const cur = get().current;
    if (!cur) return;
    const next: Campaign = {
      ...cur,
      bookmarks: (cur.bookmarks ?? []).filter(b => b.id !== id),
      updatedAt: Date.now(),
    };
    set({ current: next });
    await persistCampaign(next);
  },
}));
