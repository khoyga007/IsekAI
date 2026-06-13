import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { Avatar } from "@/lib/avatar";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import type { AffinityWidget, InventoryWidget, StatBarWidget, StatNumberWidget, TagListWidget, NoteWidget } from "@/state/types";

interface Props { open: boolean; onClose: () => void; }

// Same color mapping as DynamicHud for consistency
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
  return ACCENTS[name] ?? name;
}

function iconFor(name?: string): React.ComponentType<any> | null {
  if (!name) return null;
  const k = name[0].toUpperCase() + name.slice(1).toLowerCase();
  return (Icons as any)[k] ?? null;
}

export function CharacterSheet({ open, onClose }: Props) {
  const c = useCampaign((s) => s.current);

  if (!c) {
    return (
      <Drawer open={open} onClose={onClose} title="Character Sheet" subtitle="—" width={600}>
        <div className="text-sm py-6 text-center" style={{ color: "var(--color-text-dim)" }}>No active campaign</div>
      </Drawer>
    );
  }

  const p = c.protagonist;
  const widgets = c.hud?.widgets ?? [];

  const statBars = widgets.filter(w => w.type === "stat-bar") as StatBarWidget[];
  const statNums = widgets.filter(w => w.type === "stat-number") as StatNumberWidget[];
  const tagLists = widgets.filter(w => w.type === "tag-list") as TagListWidget[];
  const inventories = widgets.filter(w => w.type === "inventory") as InventoryWidget[];
  const affinities = widgets.filter(w => w.type === "affinity") as AffinityWidget[];
  const notes = widgets.filter(w => w.type === "note") as NoteWidget[];

  // Dynamic theme based on character's powerLevel or role
  let themeColor = "var(--color-paper)";
  if (p.powerLevel === "universal" || p.powerLevel === "galaxy-comedic") themeColor = "var(--color-violet)";
  else if (p.powerLevel === "planet" || p.powerLevel === "country-continent") themeColor = "var(--color-vermillion)";
  else if (p.powerLevel === "city-mountain" || p.powerLevel === "wall-building") themeColor = "var(--color-amber)";
  else themeColor = "var(--color-cyan)";

  return (
    <Drawer open={open} onClose={onClose} title="Character Sheet" subtitle={p.name} width={640}>
      <div className="flex flex-col gap-6">
        
        {/* Profile Header */}
        <div className="flex gap-5 items-start p-5 rounded-2xl glass relative overflow-hidden">
          <div 
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none"
            style={{ background: themeColor }}
          />
          <Avatar name={p.name} url={p.avatar} size={84} />
          <div className="flex-1 relative">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl tracking-wide" style={{ color: "var(--color-paper)" }}>{p.name}</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: `color-mix(in oklab, ${themeColor} 20%, transparent)`, color: themeColor }}>
                {p.powerLevel ?? "wall-building"}
              </span>
            </div>
            <div className="text-xs mt-1.5" style={{ color: "var(--color-text-dim)" }}>{p.role}</div>
            <p className="text-[13px] leading-relaxed mt-3" style={{ color: "var(--color-text-dim)" }}>{p.description}</p>
          </div>
        </div>

        {/* Core Stats (HP, Mana) */}
        {statBars.length > 0 && (
          <section>
            <SectionHeader label="Core Attributes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {statBars.map(w => <StatBarCard key={w.id} w={w} />)}
            </div>
          </section>
        )}

        {/* Numbers & Tags */}
        {(statNums.length > 0 || tagLists.length > 0) && (
          <section>
            <SectionHeader label="Traits & Values" />
            <div className="flex flex-wrap gap-3">
              {statNums.map(w => <StatNumberCard key={w.id} w={w} />)}
              {tagLists.map(w => <TagListCard key={w.id} w={w} />)}
            </div>
          </section>
        )}

        {/* Inventory Grid */}
        {inventories.length > 0 && (
          <section>
            <SectionHeader label="Inventory" />
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {inventories.flatMap(inv => inv.items.map(it => (
                <div key={it.name} className="aspect-square glass rounded-xl flex flex-col items-center justify-center p-2 text-center relative hover:glass-hi transition cursor-help" title={it.name}>
                  {it.qty && it.qty > 1 && (
                    <span className="absolute top-1 right-1.5 text-[9px] font-mono" style={{ color: "var(--color-amber)" }}>{it.qty}</span>
                  )}
                  <Icons.Package size={20} className="mb-1 opacity-70" style={{ color: "var(--color-text-dim)" }} />
                  <span className="text-[10px] leading-tight line-clamp-2" style={{ color: "var(--color-paper)" }}>{it.name}</span>
                </div>
              )))}
              {inventories.flatMap(i => i.items).length === 0 && (
                <div className="col-span-full text-xs opacity-50 text-center py-4">Inventory is empty</div>
              )}
            </div>
          </section>
        )}

        {/* Affinities */}
        {affinities.length > 0 && (
          <section>
            <SectionHeader label="Relationships" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {affinities.flatMap(aff => Object.entries(aff.values).map(([name, val]) => (
                <AffinityCard key={name} name={name} value={val} />
              )))}
            </div>
          </section>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <section>
            <SectionHeader label="Notes" />
            <div className="flex flex-col gap-2">
              {notes.map(w => (
                <div key={w.id} className="glass p-3 rounded-xl text-[12px] leading-relaxed" style={{ color: "var(--color-paper)" }}>
                  <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: accentColor(w.accent) }}>{w.label}</div>
                  {w.body}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </Drawer>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="text-[10px] tracking-[0.4em] uppercase mb-3 border-b border-white/5 pb-1.5" style={{ color: "var(--color-text-dim)" }}>{label}</div>;
}

function StatBarCard({ w }: { w: StatBarWidget }) {
  const pct = Math.max(0, Math.min(1, w.value / Math.max(1, w.max)));
  const c = accentColor(w.accent);
  const Icon = iconFor(w.icon);
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between text-[11px] tracking-widest uppercase mb-2" style={{ color: "var(--color-paper)" }}>
        <span className="flex items-center gap-1.5">{Icon && <Icon size={12} style={{ color: c }} />} {w.label}</span>
        <span className="font-mono text-xs">{w.value}/{w.max}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
        <motion.div
          className="h-full"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.55 }}
          style={{ background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${c} 60%, transparent))`, boxShadow: `0 0 12px -2px ${c}` }}
        />
      </div>
    </div>
  );
}

function StatNumberCard({ w }: { w: StatNumberWidget }) {
  const c = accentColor(w.accent);
  const Icon = iconFor(w.icon);
  return (
    <div className="glass rounded-xl p-3 min-w-[100px] flex-1">
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>
        {Icon && <Icon size={10} style={{ color: c }} />} {w.label}
      </div>
      <div className="font-mono text-2xl mt-1" style={{ color: c }}>{w.value}</div>
    </div>
  );
}

function TagListCard({ w }: { w: TagListWidget }) {
  return (
    <div className="glass rounded-xl p-3 flex-1 min-w-[200px]">
      <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: accentColor(w.accent) }}>{w.label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(w.tags ?? []).map(t => (
          <span key={t} className="text-[11px] px-2.5 py-0.5 rounded-full" style={{ background: "color-mix(in oklab, var(--color-paper) 8%, transparent)", border: "1px solid var(--color-border)" }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function AffinityCard({ name, value }: { name: string; value: number }) {
  const pct = (value + 100) / 200;
  const color = value >= 0 ? "var(--color-jade)" : "var(--color-vermillion)";
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between text-[11px] mb-2">
        <span style={{ color: "var(--color-paper)" }}>{name}</span>
        <span className="font-mono" style={{ color }}>{value > 0 ? `+${value}` : value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden relative" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
        <div className="absolute inset-y-0 w-px" style={{ left: "50%", background: "color-mix(in oklab, var(--color-paper) 25%, transparent)" }} />
        <motion.div
          className="h-full"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          style={{ background: color, boxShadow: `0 0 10px -2px ${color}` }}
        />
      </div>
    </div>
  );
}
