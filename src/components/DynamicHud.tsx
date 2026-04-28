import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { useCampaign } from "@/state/campaign";
import type { HudWidget, StatBarWidget, StatNumberWidget, TagListWidget, AffinityWidget, InventoryWidget, NoteWidget } from "@/state/types";
import { useT } from "@/lib/i18n";

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

export function DynamicHud() {
  const t = useT();
  const c = useCampaign((s) => s.current);
  if (!c) return <EmptyHud />;

  return (
    <aside className="relative h-full w-[280px] flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="glass rounded-xl p-3">
        <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("hud.genre")}</div>
        <div className="font-display text-sm mt-1" style={{ color: "var(--color-paper)" }}>{c.hud.genre}</div>
      </div>

      {(c.hud?.widgets ?? []).map((w) => (
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
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>
        <span className="flex items-center gap-1.5">{Icon && <Icon size={11} style={{ color: c }} />} {w.label}</span>
        <span className="font-mono">{w.value}/{w.max}</span>
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
    </div>
  );
}

function StatNumber({ w }: { w: StatNumberWidget }) {
  const c = accentColor(w.accent);
  return (
    <div>
      <Header icon={w.icon} label={w.label} accent={w.accent} />
      <div className="font-mono text-xl" style={{ color: c }}>{w.value}</div>
    </div>
  );
}

function TagList({ w }: { w: TagListWidget }) {
  return (
    <div>
      <Header label={w.label} accent={w.accent} />
      <div className="flex flex-wrap gap-1.5">
        {w.tags.length === 0 && <span className="text-[11px] opacity-40">—</span>}
        {w.tags.map((t) => (
          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "color-mix(in oklab, var(--color-paper) 8%, transparent)", border: "1px solid var(--color-border)" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function Affinity({ w }: { w: AffinityWidget }) {
  const entries = Object.entries(w.values);
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
                <span className="font-mono" style={{ color }}>{v > 0 ? `+${v}` : v}</span>
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

function Inventory({ w }: { w: InventoryWidget }) {
  return (
    <div>
      <Header icon="package" label={w.label} accent={w.accent} />
      <div className="flex flex-col gap-1">
        {w.items.length === 0 && <span className="text-[11px] opacity-40">empty</span>}
        {w.items.map((it) => (
          <div key={it.name} className="flex items-center justify-between text-[11px]">
            <span style={{ color: "var(--color-paper)" }}>{it.name}</span>
            <span className="font-mono opacity-60">×{it.qty ?? 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ w }: { w: NoteWidget }) {
  return (
    <div>
      <Header label={w.label} accent={w.accent} />
      <div className="text-[11px] leading-relaxed" style={{ color: "var(--color-paper)" }}>{w.body}</div>
    </div>
  );
}
