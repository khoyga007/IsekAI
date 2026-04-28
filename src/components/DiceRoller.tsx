import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dices, X } from "lucide-react";
import { rollExpression, formatRoll, type RollResult } from "@/lib/dice";
import { ambient } from "@/audio/ambient";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (text: string) => void;
}

const PRESETS = [
  { label: "d20", expr: "d20" },
  { label: "Adv", expr: "advd20" },
  { label: "Dis", expr: "disd20" },
  { label: "d20+5", expr: "d20+5" },
  { label: "2d6", expr: "2d6" },
  { label: "3d6", expr: "3d6" },
  { label: "d100", expr: "d100" },
  { label: "4d8+4", expr: "4d8+4" },
];

export function DiceRoller({ open, onClose, onApply }: Props) {
  const t = useT();
  const [expr, setExpr] = useState("d20");
  const [result, setResult] = useState<RollResult | null>(null);

  function roll(e?: string) {
    const x = e ?? expr;
    setExpr(x);
    const r = rollExpression(x);
    setResult(r);
    // Audio cue: bright pluck up, dull thunk if fumble, sparkle if crit.
    if (r.fumble) ambient.pluck(180, 220, "square");
    else if (r.crit) { ambient.pluck(880, 90); setTimeout(() => ambient.pluck(1320, 90), 80); setTimeout(() => ambient.pluck(1760, 120), 160); }
    else ambient.pluck(660, 90);
  }

  function apply() {
    if (!result) return;
    onApply(formatRoll(result));
    onClose();
    setResult(null);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "color-mix(in oklab, var(--color-void) 70%, transparent)", backdropFilter: "blur(6px)" }}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-50 grid place-items-center pointer-events-none"
          >
            <div className="pointer-events-auto w-[460px] max-w-[92vw] glass-hi rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="grid place-items-center w-9 h-9 rounded-lg edge-neon">
                    <Dices size={16} />
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("dice.heading")}</div>
                    <h2 className="font-display text-lg leading-none">{t("dice.title")}</h2>
                  </div>
                </div>
                <button onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition">
                  <X size={14} />
                </button>
              </div>

              <div className="brush-divider mx-5" style={{ color: "color-mix(in oklab, var(--color-vermillion) 30%, transparent)" }} />

              <div className="px-5 py-4 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <input
                    value={expr}
                    onChange={(e) => setExpr(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && roll()}
                    className="flex-1 bg-transparent px-3 py-2 rounded-lg outline-none text-base font-mono"
                    style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
                  />
                  <button
                    onClick={() => roll()}
                    className="px-5 py-2 rounded-lg edge-neon font-medium"
                    style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)" }}
                  >
                    {t("dice.btn.roll")}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => { setExpr(p.expr); roll(p.expr); }}
                      className="text-[11px] px-2.5 py-1 rounded-full transition"
                      style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-text-dim)" }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <ResultPanel result={result} />

                {result && (
                  <button
                    onClick={apply}
                    className="self-end text-xs px-4 py-2 rounded-full edge-neon-cyan"
                    style={{ background: "color-mix(in oklab, var(--color-cyan) 18%, transparent)", color: "var(--color-paper)" }}
                  >
                    {t("dice.btn.insert")}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ResultPanel({ result }: { result: RollResult | null }) {
  const t = useT();
  if (!result) {
    return (
      <div className="rounded-lg p-4 text-center text-xs"
        style={{ background: "color-mix(in oklab, var(--color-ink-700) 50%, transparent)", color: "var(--color-text-dim)" }}>
        {t("dice.empty")}
      </div>
    );
  }
  const flagColor = result.crit ? "var(--color-jade)" : result.fumble ? "var(--color-vermillion)" : null;
  const flagText = result.crit ? t("dice.crit") : result.fumble ? t("dice.fumble") : null;

  return (
    <motion.div
      key={result.total}
      initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
        border: `1px solid ${flagColor ?? "var(--color-border)"}`,
        boxShadow: flagColor ? `0 0 24px -8px ${flagColor}` : undefined,
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {result.dice.map((d, i) => (
          <Die key={i} value={d.value} sides={d.sides} dropped={d.dropped} />
        ))}
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-4xl" style={{ color: flagColor ?? "var(--color-paper)" }}>
          {result.total}
        </span>
        <span className="text-xs font-mono opacity-70">{result.breakdown}</span>
        {flagText && (
          <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded tracking-widest"
            style={{ background: `color-mix(in oklab, ${flagColor} 18%, transparent)`, color: flagColor! }}>
            {flagText}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function Die({ value, sides, dropped }: { value: number; sides: number; dropped?: boolean }) {
  const v = Math.abs(value);
  return (
    <motion.div
      initial={{ rotate: -45, opacity: 0 }}
      animate={{ rotate: 0, opacity: dropped ? 0.35 : 1 }}
      className="relative grid place-items-center w-9 h-9 rounded-md"
      style={{
        background: "color-mix(in oklab, var(--color-ink-800) 80%, transparent)",
        border: `1px solid ${dropped ? "var(--color-text-dim)" : "color-mix(in oklab, var(--color-vermillion) 50%, transparent)"}`,
        textDecoration: dropped ? "line-through" : "none",
      }}
    >
      <span className="font-display text-sm" style={{ color: "var(--color-paper)" }}>{v}</span>
      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-mono opacity-70 px-1 rounded bg-[color-mix(in_oklab,var(--color-ink-800)_90%,transparent)]">d{sides}</span>
    </motion.div>
  );
}
