import { Sparkles } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { useT } from "@/lib/i18n";

interface Props { open: boolean; onClose: () => void; }

/**
 * Memory drawer shows the chronological list of memory crystals — the
 * "key beats" the GM has pinned. Each crystal pulls into the system
 * prompt on every turn so the AI never forgets them.
 */
export function MemoryView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);
  const crystals = c?.crystals ?? [];

  return (
    <Drawer open={open} onClose={onClose} title={t("memory.title")} subtitle={c?.bible.title ?? "—"} width={520}>
      {!c ? (
        <Empty msg={t("memory.noCampaign")} />
      ) : crystals.length === 0 ? (
        <Empty msg={t("memory.empty")} />
      ) : (
        <ol className="relative pl-6 flex flex-col gap-4">
          <div className="absolute top-1 bottom-1 left-2 w-px" style={{ background: "color-mix(in oklab, var(--color-paper) 14%, transparent)" }} />
          {crystals.map((m, i) => (
            <li key={m.id} className="relative">
              <div
                className="absolute -left-6 top-1 w-4 h-4 rounded-md grid place-items-center"
                style={{
                  background: "color-mix(in oklab, var(--color-jade) 22%, transparent)",
                  boxShadow: "inset 0 0 0 1px var(--color-jade), 0 0 12px -2px var(--color-jade)",
                }}
              >
                <Sparkles size={9} style={{ color: "var(--color-jade)" }} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px]" style={{ color: "var(--color-text-dim)" }}>T{m.turn}</span>
                <span className="font-display text-sm" style={{ color: "var(--color-paper)" }}>{m.title}</span>
              </div>
              <p className="text-[12px] leading-relaxed mt-1" style={{ color: "var(--color-text-dim)" }}>{m.summary}</p>
              {i < crystals.length - 1 && <div className="brush-divider mt-3 opacity-30" style={{ color: "var(--color-paper-dim)" }} />}
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm py-6 text-center max-w-sm mx-auto" style={{ color: "var(--color-text-dim)" }}>{msg}</div>;
}
