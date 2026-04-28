import { motion } from "framer-motion";
import { Compass, Users, BookOpen, Sparkles, Settings, Plus, Bookmark } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export type RailKey = "new" | "world" | "characters" | "story" | "memory" | "saves" | "settings";

interface NavItem {
  key: RailKey;
  icon: React.ComponentType<any>;
  labelKey: string;
}

const ITEMS: NavItem[] = [
  { key: "new",        icon: Plus,      labelKey: "rail.new" },
  { key: "world",      icon: Compass,   labelKey: "rail.world" },
  { key: "characters", icon: Users,     labelKey: "rail.cast" },
  { key: "story",      icon: BookOpen,  labelKey: "rail.story" },
  { key: "memory",     icon: Sparkles,  labelKey: "rail.memory" },
  { key: "saves",      icon: Bookmark,  labelKey: "rail.saves" },
  { key: "settings",   icon: Settings,  labelKey: "rail.settings" },
];

interface Props {
  active: RailKey;
  onChange: (k: RailKey) => void;
}

export function SideRail({ active, onChange }: Props) {
  const t = useT();
  return (
    <nav className="relative h-full w-[78px] flex flex-col items-center pt-5 pb-4 select-none">
      {/* Top brand mark */}
      <div className="mb-6 flex flex-col items-center gap-1">
        <div className="relative w-10 h-10 grid place-items-center">
          <div className="absolute inset-0 rounded-md edge-neon" />
          <span className="font-display font-bold text-lg" style={{ color: "var(--color-paper)" }}>i</span>
        </div>
        <span className="text-[10px] tracking-[0.4em] font-display" style={{ color: "var(--color-text-dim)" }}>ISEK</span>
      </div>

      <div className="hairline w-8 mb-4" />

      <ul className="flex-1 flex flex-col items-center gap-2">
        {ITEMS.map((it) => {
          const isActive = active === it.key;
          const Icon = it.icon;
          return (
            <li key={it.key}>
              <button
                onClick={() => onChange(it.key)}
                className={cn(
                  "group relative flex flex-col items-center justify-center w-12 h-14 rounded-lg transition",
                  "text-paper-dim hover:text-paper",
                  isActive && "text-paper",
                )}
                style={{
                  color: isActive ? "var(--color-paper)" : "var(--color-text-dim)",
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="rail-active"
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: "color-mix(in oklab, var(--color-vermillion) 14%, transparent)",
                      boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-vermillion) 50%, transparent), 0 0 24px -8px var(--color-vermillion)",
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                )}
                <Icon size={18} strokeWidth={1.6} />
                <span className="relative mt-1 text-[9px] tracking-widest uppercase opacity-70">{t(it.labelKey)}</span>

              </button>
            </li>
          );
        })}
      </ul>

      <div className="hairline w-8 mb-3" />

      {/* Status dot */}
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-dim)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-jade)", boxShadow: "0 0 8px var(--color-jade)" }} />
        <span className="font-mono">v0.1</span>
      </div>
    </nav>
  );
}
