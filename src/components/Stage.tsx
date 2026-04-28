import { motion } from "framer-motion";
import { Sparkles, Globe2, BookText, Wand2 } from "lucide-react";
import type { SourceKind } from "@/state/types";
import { useCampaign } from "@/state/campaign";
import { StoryView } from "./StoryView";
import { useT } from "@/lib/i18n";

interface SeedCardProps {
  icon: React.ComponentType<any>;
  title: string;
  desc: string;
  accent: string;
  onClick?: () => void;
}

function SeedCard({ icon: Icon, title, desc, accent, onClick }: SeedCardProps) {
  return (
    <motion.button
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative text-left rounded-2xl p-5 glass hover:glass-hi transition overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-40 group-hover:opacity-70 transition"
        style={{ background: `radial-gradient(closest-side, ${accent}, transparent)` }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className="grid place-items-center w-10 h-10 rounded-lg"
          style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", boxShadow: `inset 0 0 0 1px ${accent}` }}
        >
          <Icon size={18} strokeWidth={1.6} />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base tracking-wide" style={{ color: "var(--color-paper)" }}>{title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-text-dim)" }}>{desc}</p>
        </div>
      </div>
    </motion.button>
  );
}

interface Props {
  onSeed: (kind: SourceKind) => void;
}

export function Stage({ onSeed }: Props) {
  const t = useT();
  const has = useCampaign((s) => !!s.current);
  if (has) {
    return (
      <section className="relative flex-1 flex flex-col overflow-hidden">
        <StoryView />
      </section>
    );
  }
  return (
    <section className="relative flex-1 flex flex-col px-8 pb-6 overflow-hidden">
      <div className="relative flex-1 grid place-items-center">
        <div className="relative max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-5xl tracking-wider">
              <span className="glitch" data-text={t("stage.title")}>{t("stage.title")}</span>
            </h2>
            <p className="mt-4 text-sm max-w-md mx-auto" style={{ color: "var(--color-text-dim)" }}>
              {t("stage.subtitle")}
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }}
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left"
          >
            {[
              { icon: BookText, title: t("stage.card.title.title"), desc: t("stage.card.title.desc"), accent: "color-mix(in oklab, var(--color-vermillion) 50%, transparent)", key: "title" as SourceKind },
              { icon: Globe2,   title: t("stage.card.world.title"), desc: t("stage.card.world.desc"), accent: "color-mix(in oklab, var(--color-cyan) 50%, transparent)",       key: "world" as SourceKind },
              { icon: Sparkles, title: t("stage.card.url.title"),   desc: t("stage.card.url.desc"),   accent: "color-mix(in oklab, var(--color-violet) 50%, transparent)",     key: "url" as SourceKind },
              { icon: Wand2,    title: t("stage.card.rng.title"),   desc: t("stage.card.rng.desc"),   accent: "color-mix(in oklab, var(--color-amber) 50%, transparent)",      key: "rng" as SourceKind },
            ].map(({ key, ...c }) => (
              <motion.div key={key} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
                <SeedCard {...c} onClick={() => onSeed(key)} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
