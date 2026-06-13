import { motion } from "framer-motion";
import { Sparkles, Play } from "lucide-react";
import type { Campaign } from "@/state/types";
import { useT } from "@/lib/i18n";

/**
 * "Previously on..." — anime-style recap shown when reopening a campaign
 * after a day or more away. Pure local data (crystals + the last scene),
 * no LLM call. Closes into the story exactly where the player left off.
 */
export function RecapModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const t = useT();
  const daysAway = Math.max(1, Math.floor((Date.now() - campaign.updatedAt) / 86_400_000));
  const crystals = (campaign.crystals ?? []).slice(-5);
  const lastScene = campaign.scenes[campaign.scenes.length - 1];
  const tail = lastScene?.panels.slice(-3) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 grid place-items-center p-8"
      style={{ background: "color-mix(in oklab, var(--color-void) 72%, transparent)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="glass-hi rounded-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-vermillion)" }}>
            ◆ {t("recap.title")}
          </div>
          <h2 className="font-display text-2xl mt-1" style={{ color: "var(--color-paper)" }}>{campaign.bible.title}</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            {t("recap.away", { d: String(daysAway) })}
          </p>
        </div>

        {crystals.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "var(--color-text-dim)" }}>
              <Sparkles size={11} style={{ color: "var(--color-jade)" }} /> {t("recap.crystals")}
            </div>
            <div className="flex flex-col gap-1.5">
              {crystals.map((m) => (
                <div key={m.id} className="text-[12px] leading-relaxed">
                  <span className="font-mono opacity-50">T{m.turn}</span>{" "}
                  <span style={{ color: "var(--color-paper)" }}>{m.title}</span>
                  <span style={{ color: "var(--color-text-dim)" }}> — {m.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tail.length > 0 && (
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "var(--color-text-dim)" }}>
              {t("recap.last")}
            </div>
            <div
              className="rounded-xl px-4 py-3 flex flex-col gap-2 text-[13px] leading-relaxed font-display italic"
              style={{ background: "color-mix(in oklab, var(--color-ink-800) 70%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
            >
              {tail.map((p, i) => (
                <p key={i}>
                  {p.kind === "dialogue" && p.speaker ? `${p.speaker}: “${p.text}”` : p.text}
                </p>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="self-end flex items-center gap-2 px-5 py-2 rounded-full text-sm edge-neon transition"
          style={{ background: "color-mix(in oklab, var(--color-vermillion) 24%, transparent)", color: "var(--color-paper)" }}
        >
          <Play size={13} /> {t("recap.continue")}
        </button>
      </motion.div>
    </motion.div>
  );
}
