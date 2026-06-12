/**
 * AvatarPicker — shown after `buildCampaign` returns a fresh world but before
 * the campaign is started. For each named character (protagonist + key cast),
 * we surface the AniList canon portrait (if the source is a known media title).
 * The user keeps it, or clears it to fall back to the procedural initials
 * sigil.
 *
 * Only source of candidates is **AniList** — free public CDN URLs for canon
 * characters. AI image generation (Nano Banana, Pollinations) was removed
 * 2026-06-12 to keep the app strictly free to run. Non-canon sources skip
 * this picker entirely (see Onboarding).
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X, ArrowRight, SkipForward } from "lucide-react";
import { Avatar } from "@/lib/avatar";
import { fetchAniListCast, isCanonSource, matchCanonAvatar } from "@/engine/avatars";
import type { Campaign, SourceKind } from "@/state/types";

interface CharSlot {
  /** Stable key — "@protagonist" or the character's name. */
  key: string;
  /** Display name. */
  name: string;
  /** Subtitle (role label). */
  role: string;
  /** Already-pre-set avatar from world builder, if any. */
  initialAvatar?: string;
  /** Index into the protagonist or bible.keyCharacters[] array. */
  charIdx: number; // -1 = protagonist
}

interface SlotState {
  /** Resolved candidate URLs (AniList CDN or pre-set avatar). */
  candidates: string[];
  /** Index into candidates that the user picked, or null = no avatar (sigil). */
  selected: number | null;
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
  const slots: CharSlot[] = useMemo(() => {
    const out: CharSlot[] = [
      {
        key: "@protagonist",
        name: campaign.protagonist.name,
        role: campaign.protagonist.role,
        initialAvatar: campaign.protagonist.avatar,
        charIdx: -1,
      },
    ];
    (campaign.bible.keyCharacters ?? []).forEach((kc, i) => {
      out.push({
        key: kc.name,
        name: kc.name,
        role: kc.role,
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
        selected: s.initialAvatar ? 0 : null,
        loading: canon,
      };
    }
    return init;
  });

  // Kick off AniList fetch (canon only) and surface a canon match per slot.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      const anilistCast = canon ? await fetchAniListCast(campaign.bible.title, ac.signal) : [];
      if (ac.signal.aborted) return;

      setState((prev) => {
        const next: Record<string, SlotState> = {};
        for (const slot of slots) {
          const cur = prev[slot.key];
          // Slots already populated with an initial avatar keep it (rare).
          if (cur.candidates.length > 0 && cur.selected !== null) {
            next[slot.key] = { ...cur, loading: false };
            continue;
          }
          const canonHit = canon ? matchCanonAvatar(slot.name, anilistCast) : null;
          next[slot.key] = {
            candidates: canonHit ? [canonHit, ...cur.candidates] : cur.candidates,
            // Pre-select the canon match — most users want it.
            selected: canonHit ? 0 : cur.selected,
            loading: false,
          };
        }
        return next;
      });
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCandidate(key: string, idx: number) {
    setState((p) => ({ ...p, [key]: { ...p[key], selected: p[key].selected === idx ? null : idx } }));
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
          <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>Choose Avatars</div>
          <h2 className="font-display text-xl mt-0.5 truncate">{campaign.bible.title}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--color-text-dim)" }}>
            Canon characters get their portrait from AniList (free). Characters without a match use a procedural sigil.
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
                {!st.loading && st.candidates.length === 0 && (
                  <span className="text-[11px] italic px-3" style={{ color: "var(--color-text-dim)" }}>No canon match — procedural sigil will be used.</span>
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
                {st.candidates.length > 0 && (
                  <button
                    onClick={() => clearSelection(slot.key)}
                    title="Use procedural sigil instead"
                    disabled={st.selected === null}
                    className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition flex-shrink-0 disabled:opacity-30"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    <SkipForward size={13} />
                  </button>
                )}
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
