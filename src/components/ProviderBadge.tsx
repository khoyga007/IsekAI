import { useSettings } from "@/state/settings";
import { PROVIDERS } from "@/providers";
import { motion } from "framer-motion";

const ACCENT: Record<string, string> = {
  anthropic: "var(--color-amber)",
  openai: "var(--color-jade)",
  google: "var(--color-cyan)",
  openrouter: "var(--color-violet)",
  deepseek: "var(--color-vermillion)",
  ollama: "var(--color-paper-dim)",
};

export function ProviderBadge({ onClick }: { onClick?: () => void }) {
  const active = useSettings((s) => s.active);
  const settings = useSettings((s) => s.providers[s.active]);
  const provider = PROVIDERS[active];
  const hasKey = !provider.needsKey || !!settings.apiKey;
  const accent = ACCENT[active];

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 px-3 py-1.5 rounded-full glass hover:glass-hi transition"
    >
      <motion.span
        animate={{ boxShadow: hasKey ? `0 0 10px ${accent}` : "0 0 0 transparent" }}
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: hasKey ? accent : "var(--color-text-dim)" }}
      />
      <span className="text-xs font-medium" style={{ color: "var(--color-paper)" }}>{provider.label}</span>
      <span className="text-[10px] font-mono" style={{ color: "var(--color-text-dim)" }}>
        {settings.model ?? "—"}
      </span>
      {!hasKey && (
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "color-mix(in oklab, var(--color-vermillion) 20%, transparent)", color: "var(--color-vermillion-glow)" }}>
          KEY
        </span>
      )}
    </button>
  );
}
