import { useEffect, useRef, useState } from "react";
import { BookOpen, RefreshCw, FastForward } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { generateRecap } from "@/engine/sequel";
import { Drawer } from "./Drawer";
import { useT } from "@/lib/i18n";

interface Props { open: boolean; onClose: () => void; }

/**
 * "Continue to Part 2" drawer — generates an editable recap of the campaign
 * so far, then forks a fresh campaign (clean context) that carries the
 * world bible, HUD state, cast, and the recap.
 */
export function SequelView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);
  const createSequel = useCampaign((s) => s.createSequel);

  const [recap, setRecap] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (!c || generating) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    setError(null);
    setRecap("");
    try {
      const out = await generateRecap(c, { signal: ac.signal, onChunk: setRecap });
      setRecap(out);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate on open (once per open, and only when there's a story).
  useEffect(() => {
    if (open && c && c.scenes.length > 0 && !recap && !generating) void generate();
    if (!open) { abortRef.current?.abort(); setRecap(""); setError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onCreate = async () => {
    if (!c || generating || !recap.trim()) return;
    if (!confirm(t("sequel.confirm"))) return;
    await createSequel(recap);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("sequel.title")}
      subtitle={c?.bible.title ?? "—"}
      width={560}
      footer={
        c && (
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full glass hover:glass-hi transition text-xs disabled:opacity-40"
              style={{ color: "var(--color-paper)" }}
            >
              <RefreshCw size={12} className={generating ? "animate-spin" : ""} /> {t("sequel.btn.regen")}
            </button>
            <div className="flex-1" />
            <button
              onClick={onCreate}
              disabled={generating || !recap.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full edge-neon text-xs disabled:opacity-40"
              style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)" }}
            >
              <FastForward size={12} /> {t("sequel.btn.create")}
            </button>
          </div>
        )
      }
    >
      {!c ? (
        <Empty msg={t("sequel.noCampaign")} />
      ) : c.scenes.length === 0 ? (
        <Empty msg={t("sequel.empty")} />
      ) : (
        <div className="flex flex-col gap-3 h-full">
          <div className="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-dim)" }}>
            <BookOpen size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--color-amber)" }} />
            <p>{t("sequel.desc")}</p>
          </div>
          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "color-mix(in oklab, var(--color-vermillion) 15%, transparent)", color: "var(--color-vermillion-glow)" }}
            >
              {error}
            </div>
          )}
          <label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-text-dim)" }}>
            {generating ? t("sequel.generating") : t("sequel.recap.label")}
          </label>
          <textarea
            value={recap}
            onChange={(e) => setRecap(e.target.value)}
            readOnly={generating}
            spellCheck={false}
            className="flex-1 min-h-[320px] w-full resize-none bg-transparent px-3 py-2 rounded-lg outline-none text-sm leading-relaxed"
            style={{
              background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
              border: "1px solid var(--color-border)",
              color: "var(--color-paper)",
            }}
            placeholder={t("sequel.recap.placeholder")}
          />
        </div>
      )}
    </Drawer>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm py-8 text-center max-w-sm mx-auto" style={{ color: "var(--color-text-dim)" }}>{msg}</div>;
}
