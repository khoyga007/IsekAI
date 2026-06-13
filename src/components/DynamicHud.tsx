import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Icons from "lucide-react";
import { useCampaign } from "@/state/campaign";
import type { HudWidget, StatBarWidget, StatNumberWidget, TagListWidget, AffinityWidget, InventoryWidget, NoteWidget } from "@/state/types";
import { useT } from "@/lib/i18n";
import { ambient } from "@/audio/ambient";

const ACCENTS: Record<string, string> = {
  vermillion: "var(--color-vermillion)",
  cyan: "var(--color-cyan)",
  amber: "var(--color-amber)",
  violet: "var(--color-violet)",
  jade: "var(--color-jade)",
  rose: "var(--color-vermillion-glow)",
};

function accentColor(name?: string) {
  if (!name) return "var(--color-paper-dim)";
  return ACCENTS[name] ?? name; // allow raw colors too
}

function iconFor(name?: string): React.ComponentType<any> | null {
  if (!name) return null;
  const k = name[0].toUpperCase() + name.slice(1).toLowerCase();
  return (Icons as any)[k] ?? null;
}

export function DynamicHud({ onOpenCharacter }: { onOpenCharacter?: () => void }) {
  const t = useT();
  const c = useCampaign((s) => s.current);
  // Inventory/affinity render only inside the CharacterSheet drawer, so
  // changes to them are invisible while it's closed — pulse a badge on the
  // Profile button instead. Signature covers exactly those hidden widgets.
  const hiddenSig = JSON.stringify(
    (c?.hud?.widgets ?? [])
      .filter(w => w.type === "inventory" || w.type === "affinity")
      .map(w => w.type === "inventory" ? w.items : w.type === "affinity" ? w.values : null),
  );
  const prevSig = useRef(hiddenSig);
  const [badge, setBadge] = useState(false);
  useEffect(() => {
    if (hiddenSig === prevSig.current) return;
    prevSig.current = hiddenSig;
    setBadge(true);
    const timer = setTimeout(() => setBadge(false), 8000);
    return () => clearTimeout(timer);
  }, [hiddenSig]);
  if (!c) return <EmptyHud />;

  return (
    <aside className="relative h-full w-[280px] flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="flex gap-2">
        <div className="glass rounded-xl p-3 flex-1">
          <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("hud.genre")}</div>
          <div className="font-display text-sm mt-1 line-clamp-1" style={{ color: "var(--color-paper)" }} title={c.hud.genre}>{c.hud.genre}</div>
        </div>
        <button
          onClick={() => { setBadge(false); onOpenCharacter?.(); }}
          className="relative glass hover:glass-hi transition rounded-xl p-3 flex flex-col items-center justify-center gap-1 min-w-[72px]"
          title="View Character"
        >
          {badge && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.35, 1] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--color-vermillion)", boxShadow: "0 0 8px var(--color-vermillion)" }}
            />
          )}
          <Icons.User size={16} style={{ color: "var(--color-text-dim)" }} />
          <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--color-paper)" }}>Profile</span>
        </button>
      </div>

      {(c.hud?.widgets ?? []).filter(w => w.type !== "inventory" && w.type !== "affinity").map((w) => (
        <motion.div
          key={w.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-3"
        >
          <Widget w={w} />
        </motion.div>
      ))}

      {(c.crystals ?? []).length > 0 && (
        <div className="glass rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("hud.memory")}</span>
            <Icons.Sparkles size={11} style={{ color: "var(--color-jade)" }} />
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {(c.crystals ?? []).slice(-6).reverse().map((m) => (
              <div key={m.id} className="text-[11px] leading-relaxed" title={m.summary}>
                <span className="font-mono opacity-50">T{m.turn}</span>{" "}
                <span style={{ color: "var(--color-paper)" }}>{m.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function EmptyHud() {
  const t = useT();
  return (
    <aside className="relative h-full w-[280px] flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="glass rounded-xl p-3">
        <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("hud.genre")}</div>
        <div className="font-display text-sm mt-1" style={{ color: "var(--color-paper)" }}>{t("hud.awaiting")}</div>
        <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {t("hud.awaiting.desc")}
        </p>
      </div>
    </aside>
  );
}

/**
 * Watch a numeric value and surface its change for ~1.4s: returns the delta
 * for a floating "+5"/"-12" indicator and optionally plays an audio cue
 * (low thunk on loss, soft chime on gain). Initial mount is not a change.
 */
function useDeltaFlash(value: number, sound = false) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ delta: number; id: number } | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    const delta = value - prev.current;
    prev.current = value;
    setFlash({ delta, id: Date.now() });
    if (sound) {
      if (delta < 0) ambient.pluck(196, 200, "square");
      else { ambient.pluck(660, 110); setTimeout(() => ambient.pluck(880, 130), 90); }
    }
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [value, sound]);
  return flash;
}

/** Floating delta number — rises and fades next to the stat readout. */
function DeltaFloat({ flash }: { flash: { delta: number; id: number } | null }) {
  return (
    <AnimatePresence>
      {flash && (
        <motion.span
          key={flash.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="absolute right-0 -top-1 font-mono text-[11px] font-bold pointer-events-none"
          style={{ color: flash.delta < 0 ? "var(--color-vermillion)" : "var(--color-jade)" }}
        >
          {flash.delta > 0 ? `+${flash.delta}` : flash.delta}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Widget({ w }: { w: HudWidget }) {
  if (w.type === "stat-bar") return <StatBar w={w} />;
  if (w.type === "stat-number") return <StatNumber w={w} />;
  if (w.type === "tag-list") return <TagList w={w} />;
  if (w.type === "affinity") return <Affinity w={w} />;
  if (w.type === "inventory") return <Inventory w={w} />;
  if (w.type === "note") return <Note w={w} />;
  return null;
}

function Header({ icon, label, accent }: { icon?: string; label: string; accent?: string }) {
  const Icon = iconFor(icon);
  const c = accentColor(accent);
  return (
    <div className="flex items-center justify-between text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: "var(--color-text-dim)" }}>
      <span className="flex items-center gap-1.5">
        {Icon && <Icon size={11} strokeWidth={2} style={{ color: c }} />}
        {label}
      </span>
    </div>
  );
}

function StatBar({ w }: { w: StatBarWidget }) {
  const pct = Math.max(0, Math.min(1, w.value / Math.max(1, w.max)));
  const c = accentColor(w.accent);
  const Icon = iconFor(w.icon);
  const flash = useDeltaFlash(w.value, true);
  const flashColor = flash && (flash.delta < 0 ? "var(--color-vermillion)" : "var(--color-jade)");
  return (
    <motion.div
      className="relative rounded-lg"
      animate={{
        boxShadow: flashColor
          ? `0 0 0 1px ${flashColor}, 0 0 18px -4px ${flashColor}`
          : "0 0 0 0px transparent",
      }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between text-[10px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>
        <span className="flex items-center gap-1.5">{Icon && <Icon size={11} style={{ color: c }} />} {w.label}</span>
        <span className="relative font-mono">
          {w.value}/{w.max}
          <DeltaFloat flash={flash} />
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
        <motion.div
          className="h-full"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${c} 60%, transparent))`, boxShadow: `0 0 12px -2px ${c}` }}
        />
      </div>
    </motion.div>
  );
}

function StatNumber({ w }: { w: StatNumberWidget }) {
  const c = accentColor(w.accent);
  const numeric = typeof w.value === "number" ? w.value : Number(w.value);
  const flash = useDeltaFlash(Number.isFinite(numeric) ? numeric : 0);
  return (
    <div>
      <Header icon={w.icon} label={w.label} accent={w.accent} />
      <div className="relative inline-block">
        <motion.div
          key={String(w.value)}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className="font-mono text-xl"
          style={{ color: c }}
        >
          {w.value}
        </motion.div>
        <DeltaFloat flash={flash} />
      </div>
    </div>
  );
}

function TagList({ w }: { w: TagListWidget }) {
  const tags = w.tags ?? [];
  return (
    <div>
      <Header label={w.label} accent={w.accent} />
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-[11px] opacity-40">—</span>}
        <AnimatePresence initial={false}>
          {tags.map((t) => (
            <motion.span
              key={t}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 480, damping: 22 }}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "color-mix(in oklab, var(--color-paper) 8%, transparent)", border: "1px solid var(--color-border)" }}
            >
              {t}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Affinity({ w }: { w: AffinityWidget }) {
  const entries = Object.entries(w.values ?? {});
  return (
    <div>
      <Header label={w.label} accent={w.accent} />
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 && <span className="text-[11px] opacity-40">—</span>}
        {entries.map(([name, v]) => {
          const pct = (v + 100) / 200;
          const color = v >= 0 ? "var(--color-jade)" : "var(--color-vermillion)";
          return (
            <div key={name}>
              <div className="flex items-center justify-between text-[10px]">
                <span style={{ color: "var(--color-paper)" }}>{name}</span>
                <AffinityValue v={v} color={color} />
              </div>
              <div className="h-1 rounded-full overflow-hidden mt-0.5 relative" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
                <div className="absolute inset-y-0 w-px" style={{ left: "50%", background: "color-mix(in oklab, var(--color-paper) 25%, transparent)" }} />
                <motion.div
                  className="h-full"
                  initial={false}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.5 }}
                  style={{ background: color, boxShadow: `0 0 10px -2px ${color}` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AffinityValue({ v, color }: { v: number; color: string }) {
  const flash = useDeltaFlash(v);
  return (
    <span className="relative font-mono" style={{ color }}>
      {v > 0 ? `+${v}` : v}
      <DeltaFloat flash={flash} />
    </span>
  );
}

function Inventory({ w }: { w: InventoryWidget }) {
  const items = w.items ?? [];
  return (
    <div>
      <Header icon="package" label={w.label} accent={w.accent} />
      <div className="flex flex-col gap-1">
        {items.length === 0 && <span className="text-[11px] opacity-40">empty</span>}
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div
              key={it.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between text-[11px]"
            >
              <span style={{ color: "var(--color-paper)" }}>{it.name}</span>
              <ItemQty qty={it.qty ?? 1} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ItemQty({ qty }: { qty: number }) {
  const flash = useDeltaFlash(qty);
  return (
    <span className="relative font-mono opacity-60">
      ×{qty}
      <DeltaFloat flash={flash} />
    </span>
  );
}

function Note({ w }: { w: NoteWidget }) {
  return (
    <div>
      <Header label={w.label} accent={w.accent} />
      <div className="text-[11px] leading-relaxed" style={{ color: "var(--color-paper)" }}>{w.body ?? ""}</div>
    </div>
  );
}
