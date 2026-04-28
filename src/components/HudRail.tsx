import { motion } from "framer-motion";
import { Heart, Zap, Shield, Sparkle, Sparkles } from "lucide-react";

/**
 * Right rail — the dynamic HUD.
 *
 * Phase 1: shows a "no campaign yet" placeholder with a preview of what
 * the genre-adaptive HUD will look like (RPG bars, status effects).
 * Phase 2 will wire this to AI-generated genre detection.
 */

function StatBar({ icon: Icon, label, value, max, color }: {
  icon: React.ComponentType<any>;
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>
        <span className="flex items-center gap-1.5"><Icon size={11} strokeWidth={2} style={{ color }} /> {label}</span>
        <span className="font-mono">{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
        <motion.div
          className="h-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 60%, transparent))`, boxShadow: `0 0 12px -2px ${color}` }}
        />
      </div>
    </div>
  );
}

export function HudRail() {
  return (
    <aside className="relative h-full w-[280px] flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Genre badge */}
      <div className="glass rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>Genre</span>
          <span className="text-[10px] font-mono" style={{ color: "var(--color-cyan)" }}>—</span>
        </div>
        <div className="mt-1.5 font-display text-sm" style={{ color: "var(--color-paper)" }}>Awaiting Story</div>
        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          IsekAI will craft a HUD shaped to your story — RPG bars, romance affinity meters, mystery clue boards…
        </p>
      </div>

      {/* Preview HUD */}
      <div className="glass rounded-xl p-3 flex flex-col gap-3 opacity-70">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>HUD Preview</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "color-mix(in oklab, var(--color-violet) 18%, transparent)", color: "var(--color-violet)" }}>RPG</span>
        </div>
        <StatBar icon={Heart} label="HP"  value={84}  max={100} color="var(--color-vermillion)" />
        <StatBar icon={Zap}   label="MP"  value={42}  max={80}  color="var(--color-cyan)" />
        <StatBar icon={Shield} label="DEF" value={31}  max={50}  color="var(--color-amber)" />
        <StatBar icon={Sparkle} label="EXP" value={120} max={300} color="var(--color-violet)" />
      </div>

      {/* Memory crystals */}
      <div className="glass rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>Memory Crystals</span>
          <Sparkles size={11} style={{ color: "var(--color-jade)" }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className="w-7 h-7 rounded-md grid place-items-center"
              style={{
                background: "linear-gradient(135deg, color-mix(in oklab, var(--color-paper) 6%, transparent), color-mix(in oklab, var(--color-paper) 2%, transparent))",
                boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-paper) 12%, transparent)",
              }}
            >
              <span className="text-[9px] font-mono" style={{ color: "var(--color-text-dim)" }}>—</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          Key story beats will crystalize here. Click one to recall it.
        </p>
      </div>
    </aside>
  );
}
