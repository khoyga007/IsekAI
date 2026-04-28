import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Database, Repeat } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCampaign } from "@/state/campaign";
import { providerLabel } from "@/engine/chat";

interface Props {
  chapter?: string;
  title?: string;
  subtitle?: string;
}

export function TopBar({ chapter, title, subtitle }: Props) {
  const t = useT();
  chapter = chapter ?? t("header.prologue");
  title = title ?? t("header.blank");
  subtitle = subtitle ?? t("header.subtitle");
  return (
    <header className="relative px-8 pt-5 pb-3">
      <div className="flex items-end justify-between gap-6">
        <div>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 text-[11px] tracking-[0.4em] uppercase font-display"
            style={{ color: "var(--color-text-dim)" }}
          >
            <span style={{ color: "var(--color-vermillion)" }}>◆</span>
            <span>{chapter}</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-brush text-3xl mt-1 leading-tight"
            style={{ color: "var(--color-paper)" }}
          >
            {title}
          </motion.h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-dim)" }}>{subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span className="font-display text-xs tracking-[0.4em]" style={{ color: "var(--color-cyan)" }}>CH · 00</span>
          <span className="font-mono text-[10px]" style={{ color: "var(--color-text-dim)" }}>{t("brand.tagline")}</span>
          <UsageChip />
          <FallbackNotice />
        </div>
      </div>

      <div className="mt-4 brush-divider" style={{ color: "color-mix(in oklab, var(--color-vermillion) 40%, transparent)" }} />
    </header>
  );
}

/** Last-turn token usage. Hidden until the first turn completes with usage data. */
function UsageChip() {
  const usage = useCampaign((s) => s.lastUsage);
  if (!usage || (!usage.inputTokens && !usage.outputTokens)) return null;
  const inTok = usage.inputTokens ?? 0;
  const outTok = usage.outputTokens ?? 0;
  const cached = usage.cachedTokens ?? 0;
  const cachePct = inTok > 0 ? Math.round((cached / inTok) * 100) : 0;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      key={`${inTok}-${outTok}`}
      className="flex items-center gap-2 text-[10px] font-mono px-2 py-0.5 rounded-full glass"
      title={`Input ${inTok} tok · Output ${outTok} tok · Cached ${cached} tok (${cachePct}%)`}
      style={{ color: "var(--color-text-dim)" }}
    >
      <span className="flex items-center gap-0.5">
        <ArrowUp size={9} />
        {fmt(inTok)}
      </span>
      <span className="flex items-center gap-0.5">
        <ArrowDown size={9} style={{ color: "var(--color-amber)" }} />
        {fmt(outTok)}
      </span>
      {cached > 0 && (
        <span className="flex items-center gap-0.5" style={{ color: "var(--color-jade)" }}>
          <Database size={9} />
          {cachePct}%
        </span>
      )}
    </motion.div>
  );
}

/**
 * Transient banner shown when streamWithActive fell back from the primary
 * provider to the configured fallback. Auto-clears after 6 seconds.
 */
function FallbackNotice() {
  const t = useT();
  const fallback = useCampaign((s) => s.lastFallback);
  const setLastFallback = useCampaign((s) => s.setLastFallback);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fallback) { setVisible(false); return; }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      // Clear from store so it won't re-trigger on next mount.
      setLastFallback(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [fallback?.at, setLastFallback]);

  return (
    <AnimatePresence>
      {visible && fallback && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full"
          style={{
            background: "color-mix(in oklab, var(--color-cyan) 15%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-cyan) 40%, transparent)",
            color: "var(--color-paper)",
          }}
          title={`From ${providerLabel(fallback.from)} → ${providerLabel(fallback.to)}`}
        >
          <Repeat size={9} style={{ color: "var(--color-cyan)" }} />
          {t("settings.fallback.notice", { label: providerLabel(fallback.to) })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
