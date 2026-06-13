import { useMemo } from "react";
import { motion } from "framer-motion";
import { BookOpen, Feather, Sparkles, Users, Archive } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { useT } from "@/lib/i18n";

interface Props { open: boolean; onClose: () => void; }

const BEAT_COLORS: Record<string, string> = {
  action:        "var(--color-vermillion)",
  plot:          "var(--color-amber)",
  downtime:      "var(--color-jade)",
  banter:        "var(--color-cyan)",
  romance:       "var(--color-vermillion-glow)",
  sidequest:     "var(--color-violet)",
  introspection: "#8b7fa8",
  worldbuilding: "#d9a36b",
};

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Studio stats drawer — the "craft" half of the app identity. Everything
 * computes from the campaign object on open; no tracking, no persistence.
 */
export function StatsView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);

  const stats = useMemo(() => {
    if (!c) return null;
    const scenes = c.scenes ?? [];
    const turns = scenes.length > 0 ? scenes[scenes.length - 1].turn + 1 : 0;
    let storyWords = 0;
    let playerWords = 0;
    const beats = new Map<string, number>();
    for (const s of scenes) {
      for (const p of s.panels) storyWords += countWords(p.text);
      if (s.playerInput) playerWords += countWords(s.playerInput.text);
      if (s.beat) beats.set(s.beat, (beats.get(s.beat) ?? 0) + 1);
    }
    const beatTotal = [...beats.values()].reduce((a, b) => a + b, 0);
    return {
      turns,
      storyWords,
      playerWords,
      archived: scenes.filter(s => s.archived).length,
      crystals: (c.crystals ?? []).length,
      cast: (c.bible.keyCharacters ?? []).length,
      beats: [...beats.entries()].sort((a, b) => b[1] - a[1]),
      beatTotal,
    };
  }, [c]);

  return (
    <Drawer open={open} onClose={onClose} title={t("stats.title")} subtitle={c?.bible.title ?? "—"} width={520}>
      {!c || !stats ? (
        <p className="text-sm opacity-60">{t("stats.empty")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={BookOpen} label={t("stats.turns")} value={String(stats.turns)} accent="var(--color-vermillion)" />
            <StatCard icon={Feather} label={t("stats.storyWords")} value={stats.storyWords.toLocaleString()} accent="var(--color-cyan)" />
            <StatCard icon={Feather} label={t("stats.playerWords")} value={stats.playerWords.toLocaleString()} accent="var(--color-amber)" />
            <StatCard icon={Sparkles} label={t("stats.crystals")} value={String(stats.crystals)} accent="var(--color-jade)" />
            <StatCard icon={Users} label={t("stats.cast")} value={String(stats.cast)} accent="var(--color-violet)" />
            <StatCard icon={Archive} label={t("stats.archived")} value={String(stats.archived)} accent="var(--color-text-dim)" />
          </div>

          {stats.beatTotal > 0 && (
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "var(--color-text-dim)" }}>
                {t("stats.beats")}
              </div>
              <div className="flex flex-col gap-2">
                {stats.beats.map(([beat, n]) => {
                  const pct = (n / stats.beatTotal) * 100;
                  const color = BEAT_COLORS[beat] ?? "var(--color-paper-dim)";
                  return (
                    <div key={beat}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span style={{ color: "var(--color-paper)" }}>{beat}</span>
                        <span className="font-mono" style={{ color: "var(--color-text-dim)" }}>{n} · {Math.round(pct)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in oklab, var(--color-ink-600) 80%, transparent)" }}>
                        <motion.div
                          className="h-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                          style={{ background: color, boxShadow: `0 0 10px -2px ${color}` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<any>; label: string; value: string; accent: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--color-text-dim)" }}>
        <Icon size={11} style={{ color: accent }} /> {label}
      </div>
      <div className="font-mono text-xl mt-1" style={{ color: "var(--color-paper)" }}>{value}</div>
    </div>
  );
}
