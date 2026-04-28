/**
 * AvatarPicker — shown after `buildCampaign` returns a fresh world but before
 * the campaign is started. For each named character (protagonist + key cast),
 * we surface a horizontal gallery of candidate portraits. The user clicks the
 * one they want, hits "Regenerate" for more, or skips to fall back to the
 * procedural initials sigil.
 *
 * Sources of candidates (in priority order):
 *   1. **AniList** for known media — sync URL for canon match (if any).
 *   2. **Nano Banana** (Google Gemini Image) — async, ~$0.04/image, requires
 *      Google API key. Returns base64 data URL. High quality.
 *   3. **Pollinations.ai** — sync deterministic URL, free, no key. Used as
 *      fallback when Google key is absent. "Regenerate" shifts seed range.
 *
 * Async gens run in parallel; spinners render alongside resolved candidates.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, X, ArrowRight, SkipForward, Sparkles } from "lucide-react";
import { Avatar } from "@/lib/avatar";
import {
  buildPortraitPrompt,
  fetchAniListCast,
  generateCandidates,
  generateNanoBananaImage,
  isCanonSource,
  matchCanonAvatar,
} from "@/engine/avatars";
import { useSettings } from "@/state/settings";
import type { Campaign, SourceKind } from "@/state/types";

interface CharSlot {
  /** Stable key — "@protagonist" or the character's name. */
  key: string;
  /** Display name. */
  name: string;
  /** Subtitle (role label). */
  role: string;
  /** Description (used for portrait prompt). */
  desc: string;
  /** Already-pre-set avatar from world builder, if any. */
  initialAvatar?: string;
  /** Index into the protagonist or bible.keyCharacters[] array. */
  charIdx: number; // -1 = protagonist
}

interface SlotState {
  /** Resolved candidate URLs (AniList CDN, Pollinations, or data URLs). */
  candidates: string[];
  /** Number of in-flight Nano Banana generations — render this many spinner placeholders. */
  pending: number;
  /** Index into candidates that the user picked, or null = no avatar. */
  selected: number | null;
  /** Seed offset for "Regenerate" with Pollinations — each click shifts to fresh seeds. */
  seedOffset: number;
  /** True while waiting for AniList fetch. */
  loading: boolean;
}

interface Props {
  campaign: Campaign;
  sourceKind: SourceKind;
  onConfirm: (avatars: { protagonist?: string; keyCharacters: Record<string, string | undefined> }) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function AvatarPicker({ campaign, sourceKind, onConfirm, onSkip, onCancel }: Props) {
  const googleApiKey = useSettings((s) => s.providers.google.apiKey);
  const useNanoBanana = !!googleApiKey;
  /** Per-batch count: 3 for Nano Banana (paid) is plenty; 4 for Pollinations (free). */
  const PER_BATCH = useNanoBanana ? 3 : 4;

  const slots: CharSlot[] = useMemo(() => {
    const out: CharSlot[] = [
      {
        key: "@protagonist",
        name: campaign.protagonist.name,
        role: campaign.protagonist.role,
        desc: campaign.protagonist.description,
        initialAvatar: campaign.protagonist.avatar,
        charIdx: -1,
      },
    ];
    (campaign.bible.keyCharacters ?? []).forEach((kc, i) => {
      out.push({
        key: kc.name,
        name: kc.name,
        role: kc.role,
        desc: kc.desc,
        initialAvatar: kc.avatar,
        charIdx: i,
      });
    });
    return out;
  }, [campaign]);

  const canon = isCanonSource(sourceKind);

  const [state, setState] = useState<Record<string, SlotState>>(() => {
    const init: Record<string, SlotState> = {};
    for (const s of slots) {
      init[s.key] = {
        candidates: s.initialAvatar ? [s.initialAvatar] : [],
        pending: 0,
        selected: s.initialAvatar ? 0 : null,
        seedOffset: 0,
        loading: canon,
      };
    }
    return init;
  });

  /** Build a portrait prompt for a slot — single source of truth used by both
   *  the initial mount and the Regenerate button. */
  function promptFor(slot: CharSlot): string {
    return buildPortraitPrompt({
      name: slot.name,
      description: slot.desc,
      role: slot.role,
      worldGenre: campaign.bible.genre,
      worldTone: campaign.bible.tone,
    });
  }

  /** Fire `count` Nano Banana generations for one slot in parallel; resolves
   *  each into the candidates array as it completes (no await for batch). */
  function fireNanoBananaGens(slot: CharSlot, count: number, signal?: AbortSignal): void {
    if (!googleApiKey) return;
    const prompt = promptFor(slot);
    setState((p) => ({ ...p, [slot.key]: { ...p[slot.key], pending: p[slot.key].pending + count } }));
    for (let i = 0; i < count; i++) {
      generateNanoBananaImage(prompt, googleApiKey, { signal })
        .then((dataUrl) => {
          setState((p) => ({
            ...p,
            [slot.key]: {
              ...p[slot.key],
              candidates: [...p[slot.key].candidates, dataUrl],
              pending: Math.max(0, p[slot.key].pending - 1),
            },
          }));
        })
        .catch((err) => {
          console.warn(`[AvatarPicker] Nano Banana failed for ${slot.name}:`, err);
          setState((p) => ({
            ...p,
            [slot.key]: { ...p[slot.key], pending: Math.max(0, p[slot.key].pending - 1) },
          }));
        });
    }
  }

  /** Append `count` Pollinations URLs synchronously. */
  function appendPollinations(slot: CharSlot, count: number, offset: number): void {
    const prompt = promptFor(slot);
    const fresh = generateCandidates(prompt, count, offset);
    setState((p) => ({
      ...p,
      [slot.key]: {
        ...p[slot.key],
        candidates: [...p[slot.key].candidates, ...fresh],
        seedOffset: offset,
      },
    }));
  }

  // Kick off AniList fetch (canon only), then seed the initial candidate list
  // per slot via either Nano Banana (async) or Pollinations (sync).
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const anilistCast = canon ? await fetchAniListCast(campaign.bible.title, ac.signal) : [];
      if (ac.signal.aborted) return;

      // Mark AniList loading done up-front, even before per-slot gens finish.
      setState((prev) => {
        const next: Record<string, SlotState> = {};
        for (const k of Object.keys(prev)) next[k] = { ...prev[k], loading: false };
        return next;
      });

      for (const slot of slots) {
        // Skip slots already populated with an initial avatar (rare).
        const existing = state[slot.key];
        if (existing && existing.candidates.length > 0 && existing.selected !== null) continue;

        // 1. Try canon match — sync URL, no cost.
        const canonHit = canon ? matchCanonAvatar(slot.name, anilistCast) : null;
        if (canonHit) {
          setState((p) => ({
            ...p,
            [slot.key]: { ...p[slot.key], candidates: [canonHit, ...p[slot.key].candidates] },
          }));
        }

        // 2. Add gen candidates.
        if (useNanoBanana) {
          fireNanoBananaGens(slot, PER_BATCH, ac.signal);
        } else {
          appendPollinations(slot, PER_BATCH, 0);
        }
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCandidate(key: string, idx: number) {
    setState((p) => ({ ...p, [key]: { ...p[key], selected: p[key].selected === idx ? null : idx } }));
  }

  function regenerate(slot: CharSlot) {
    if (useNanoBanana) {
      fireNanoBananaGens(slot, PER_BATCH);
    } else {
      const nextOffset = state[slot.key].seedOffset + 1;
      appendPollinations(slot, PER_BATCH, nextOffset);
    }
  }

  function clearSelection(key: string) {
    setState((p) => ({ ...p, [key]: { ...p[key], selected: null } }));
  }

  function confirm() {
    const out: { protagonist?: string; keyCharacters: Record<string, string | undefined> } = {
      protagonist: undefined,
      keyCharacters: {},
    };
    for (const slot of slots) {
      const st = state[slot.key];
      const url = st.selected !== null ? st.candidates[st.selected] : undefined;
      if (slot.charIdx === -1) out.protagonist = url;
      else out.keyCharacters[slot.name] = url;
    }
    onConfirm(out);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto w-[820px] max-w-[95vw] glass-hi rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>Choose Avatars</div>
            {useNanoBanana && (
              <span
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest"
                style={{ background: "color-mix(in oklab, var(--color-amber) 15%, transparent)", color: "var(--color-amber)" }}
                title="Using Google Nano Banana for high-quality generation. ~$0.04 per image."
              >
                <Sparkles size={9} /> NANO BANANA
              </span>
            )}
          </div>
          <h2 className="font-display text-xl mt-0.5 truncate">{campaign.bible.title}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-dim)" }}>
            {useNanoBanana
              ? "Nano Banana gens take ~3-5s each. AniList tries first for canon characters; pick or regenerate."
              : canon
              ? "Canon characters get matches from AniList; Pollinations alternatives are free but lower quality."
              : "Pollinations gens are free. Add a Google API key in Settings for Nano Banana quality."}
          </p>
        </div>
        <button onClick={onCancel} className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition">
          <X size={16} />
        </button>
      </div>

      <div className="brush-divider mx-6 flex-shrink-0" style={{ color: "color-mix(in oklab, var(--color-vermillion) 30%, transparent)" }} />

      {/* Body — character rows */}
      <div className="px-6 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
        {slots.map((slot) => {
          const st = state[slot.key];
          return (
            <div key={slot.key} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-sm" style={{ color: "var(--color-paper)" }}>{slot.name}</span>
                {slot.charIdx === -1 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest" style={{ background: "color-mix(in oklab, var(--color-vermillion) 18%, transparent)", color: "var(--color-vermillion)" }}>YOU</span>
                )}
                <span className="text-[11px]" style={{ color: "var(--color-text-dim)" }}>{slot.role}</span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {st.loading && (
                  <div className="flex items-center gap-2 text-[11px] px-3 py-2" style={{ color: "var(--color-text-dim)" }}>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Looking up canon portrait…</span>
                  </div>
                )}
                {!st.loading && st.candidates.length === 0 && st.pending === 0 && (
                  <span className="text-[11px] italic px-3" style={{ color: "var(--color-text-dim)" }}>No candidates yet — click Regenerate.</span>
                )}
                {st.candidates.map((url, i) => (
                  <Avatar
                    key={`${url.slice(0, 80)}-${i}`}
                    name={slot.name}
                    url={url}
                    size={72}
                    selected={st.selected === i}
                    onClick={() => selectCandidate(slot.key, i)}
                  />
                ))}
                {/* Pending spinner placeholders for in-flight Nano Banana gens */}
                {Array.from({ length: st.pending }).map((_, i) => (
                  <div
                    key={`pending-${i}`}
                    className="grid place-items-center flex-shrink-0"
                    style={{
                      width: 72, height: 72, borderRadius: "9999px",
                      background: "color-mix(in oklab, var(--color-amber) 8%, transparent)",
                      boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-amber) 30%, transparent)",
                    }}
                    title="Generating with Nano Banana…"
                  >
                    <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-amber)" }} />
                  </div>
                ))}
                <button
                  onClick={() => regenerate(slot)}
                  title={useNanoBanana ? `Generate ${PER_BATCH} more (Nano Banana, ~$0.04 each)` : `Generate ${PER_BATCH} more variants (free)`}
                  className="ml-1 grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition flex-shrink-0"
                  style={{ color: "var(--color-violet)" }}
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  onClick={() => clearSelection(slot.key)}
                  title="Use procedural sigil instead"
                  disabled={st.selected === null}
                  className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition flex-shrink-0 disabled:opacity-30"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  <SkipForward size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0 border-t" style={{ borderColor: "var(--color-border)" }}>
        <button
          onClick={onSkip}
          className="text-xs px-4 py-2 rounded-full transition"
          style={{ color: "var(--color-text-dim)" }}
        >
          Skip — use sigils for everyone
        </button>
        <button
          onClick={confirm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full edge-neon text-sm font-medium"
          style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)", color: "var(--color-paper)" }}
        >
          Begin <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}
