import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Check, X } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { useSettings } from "@/state/settings";
import type { Panel } from "@/state/types";
import { cn } from "@/lib/cn";
import { Avatar } from "@/lib/avatar";
import { chipBus } from "@/lib/chipBus";
import { useTypewriter } from "@/lib/typewriter";
import { useT } from "@/lib/i18n";

/**
 * StoryView — vertical scrolling manga page.
 * Each scene is a "page break"; each panel inside renders by kind:
 *  - narration  → bordered manga frame, serif
 *  - action     → angular slash frame, cyan accent
 *  - dialogue   → speech bubble (left for NPCs, right for protagonist… we left-align all NPCs for clarity)
 *  - thought    → italic cloud bubble
 *  - system     → centered tag, dim
 */
export function StoryView() {
  const c = useCampaign((s) => s.current);
  const draft = useCampaign((s) => s.draft);
  const streaming = useCampaign((s) => s.streaming);
  const typewriterEnabled = useSettings((s) => s.ui.typewriter);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [skipDraft, setSkipDraft] = useState(false);

  // Reset skip when a new turn begins.
  useEffect(() => {
    if (streaming) setSkipDraft(false);
  }, [streaming]);

  // Auto-scroll to bottom on new panels.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [c?.scenes.length, draft?.panels.length, draft?.raw.length]);

  const allScenes = useMemo(() => c?.scenes ?? [], [c]);

  if (!c) return null;

  const lastScene = allScenes.length > 0 ? allScenes[allScenes.length - 1] : null;
  const showChips = !!lastScene && !streaming && !draft && (lastScene.suggestions?.length ?? 0) > 0;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 pb-2">
      <div className="max-w-3xl mx-auto flex flex-col gap-10 py-2">
        {allScenes.map((s, idx) => (
          <ScenePage key={s.id} index={idx} sceneIdx={idx} panels={s.panels} input={s.playerInput} editable />
        ))}
        {draft && (
          <ScenePage
            index={allScenes.length}
            panels={draft.panels}
            streaming={streaming}
            rawTail={draft.raw}
            typewriter={typewriterEnabled}
            skip={skipDraft}
            onSkip={() => setSkipDraft(true)}
          />
        )}
        {showChips && lastScene?.suggestions && (
          <SuggestionChips suggestions={lastScene.suggestions} />
        )}
      </div>
    </div>
  );
}

function SuggestionChips({ suggestions }: { suggestions: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="flex flex-wrap gap-2 -mt-4 select-none"
    >
      {suggestions.map((s, i) => (
        <motion.button
          key={`${i}-${s}`}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => chipBus.emit(s)}
          className="text-[12px] px-3.5 py-1.5 rounded-full transition"
          style={{
            background: "color-mix(in oklab, var(--color-vermillion) 10%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-vermillion) 38%, transparent)",
            color: "var(--color-paper)",
          }}
        >
          <span className="font-mono text-[10px] mr-2 opacity-60" style={{ color: "var(--color-vermillion)" }}>▸</span>
          {s}
        </motion.button>
      ))}
    </motion.div>
  );
}

function ScenePage({
  index,
  sceneIdx,
  panels,
  input,
  streaming,
  rawTail,
  typewriter,
  skip,
  onSkip,
  editable,
}: {
  index: number;
  /** When set, panels in this scene are committed and editable. Omit for draft scene. */
  sceneIdx?: number;
  panels: Panel[];
  input?: { mode: string; text: string };
  streaming?: boolean;
  rawTail?: string;
  typewriter?: boolean;
  skip?: boolean;
  onSkip?: () => void;
  editable?: boolean;
}) {
  // Skip-on-click only meaningful while typing out a draft scene.
  const handleSkipClick = typewriter && !skip ? onSkip : undefined;
  return (
    <article
      className={cn("relative", handleSkipClick && "cursor-pointer")}
      onClick={handleSkipClick}
      title={handleSkipClick ? "Click to reveal all" : undefined}
    >
      {/* Chapter mark */}
      <div className="flex items-center gap-3 mb-3 select-none">
        <span className="font-display text-[10px] tracking-[0.4em]" style={{ color: "var(--color-vermillion)" }}>
          ◆ TURN {String(index).padStart(2, "0")}
        </span>
        <div className="flex-1 brush-divider" style={{ color: "color-mix(in oklab, var(--color-paper) 8%, transparent)" }} />
      </div>

      {input && <PlayerInputCard mode={input.mode} text={input.text} />}

      <div className="flex flex-col gap-3 mt-3">
        <AnimatePresence initial={false}>
          {panels.map((p, i) => (
            <PanelView
              key={i}
              panel={p}
              typewriter={typewriter}
              skip={skip}
              sceneIdx={sceneIdx}
              panelIdx={i}
              editable={!!editable}
            />
          ))}
        </AnimatePresence>
        {streaming && panels.length === 0 && rawTail !== undefined && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-dim)" }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: "var(--color-vermillion)" }} />
            <span>weaving the next page…</span>
          </div>
        )}
      </div>
    </article>
  );
}

function PlayerInputCard({ mode, text }: { mode: string; text: string }) {
  const accent =
    mode === "say" ? "var(--color-cyan)"
    : mode === "do" ? "var(--color-vermillion)"
    : mode === "think" ? "var(--color-violet)"
    : "var(--color-amber)";
  const prefix =
    mode === "say" ? '"'
    : mode === "do" ? "▸"
    : mode === "think" ? "~"
    : "//";
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
      style={{
        background: "color-mix(in oklab, var(--color-ink-700) 70%, transparent)",
        border: `1px solid color-mix(in oklab, ${accent} 40%, transparent)`,
        color: "var(--color-paper)",
      }}
    >
      <span className="font-mono text-[10px] tracking-widest opacity-60 mr-2" style={{ color: accent }}>{prefix}</span>
      {mode === "say" ? `"${text}"` : text}
    </motion.div>
  );
}

function PanelView({
  panel,
  typewriter,
  skip,
  sceneIdx,
  panelIdx,
  editable,
}: {
  panel: Panel;
  typewriter?: boolean;
  skip?: boolean;
  sceneIdx?: number;
  panelIdx?: number;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && sceneIdx !== undefined && panelIdx !== undefined) {
    return (
      <PanelEditor
        panel={panel}
        sceneIdx={sceneIdx}
        panelIdx={panelIdx}
        onDone={() => setEditing(false)}
      />
    );
  }
  const canEdit = editable && sceneIdx !== undefined && panelIdx !== undefined;
  return (
    <div className="relative group">
      <PanelContent panel={panel} typewriter={typewriter} skip={skip} />
      {canEdit && <PanelEditButton onClick={() => setEditing(true)} />}
    </div>
  );
}

function PanelEditButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      title={t("panel.btn.edit")}
      className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 z-10 grid place-items-center w-6 h-6 rounded-full transition glass-hi"
      style={{ color: "var(--color-paper)" }}
    >
      <Pencil size={11} />
    </button>
  );
}

function PanelEditor({
  panel,
  sceneIdx,
  panelIdx,
  onDone,
}: {
  panel: Panel;
  sceneIdx: number;
  panelIdx: number;
  onDone: () => void;
}) {
  const t = useT();
  const updatePanel = useCampaign((s) => s.updatePanel);
  const [text, setText] = useState(panel.text);
  const [speaker, setSpeaker] = useState(panel.speaker ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasSpeaker = panel.kind === "dialogue" || panel.kind === "thought";

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const updates: Partial<Panel> = { text: text.trim() || panel.text };
    if (hasSpeaker) updates.speaker = speaker.trim() || undefined;
    await updatePanel(sceneIdx, panelIdx, updates);
    onDone();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onDone(); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); }
  }

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-2"
      style={{
        background: "color-mix(in oklab, var(--color-violet) 10%, transparent)",
        border: "1px dashed color-mix(in oklab, var(--color-violet) 50%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase font-mono opacity-70">
        <span style={{ color: "var(--color-violet)" }}>◆ {panel.kind}</span>
        <span className="flex-1">{t("panel.edit.hint")}</span>
      </div>
      {hasSpeaker && (
        <input
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Speaker"
          className="bg-transparent px-2 py-1 rounded outline-none text-sm font-mono"
          style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
        />
      )}
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        rows={Math.max(2, Math.min(8, text.split("\n").length + 1))}
        className="bg-transparent px-2 py-1.5 rounded outline-none text-sm leading-relaxed resize-none"
        style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onDone}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs glass hover:glass-hi transition"
          style={{ color: "var(--color-text-dim)" }}
        >
          <X size={11} /> {t("panel.btn.cancel")}
        </button>
        <button
          onClick={() => void save()}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs edge-neon"
          style={{ background: "color-mix(in oklab, var(--color-violet) 22%, transparent)", color: "var(--color-paper)" }}
        >
          <Check size={11} /> {t("panel.btn.save")}
        </button>
      </div>
    </div>
  );
}

function PanelContent({ panel, typewriter, skip }: { panel: Panel; typewriter?: boolean; skip?: boolean }) {
  const text = useTypewriter(panel.text, !!typewriter, !!skip);
  const isPartial = !!typewriter && text.length < panel.text.length;
  const cursor = isPartial ? (
    <span
      className="inline-block w-[0.45em] h-[0.95em] ml-0.5 animate-pulse"
      style={{ background: "var(--color-vermillion)", verticalAlign: "-0.1em", opacity: 0.8 }}
    />
  ) : null;
  const common = "rounded-xl";
  if (panel.kind === "narration") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(common, "px-5 py-4 relative bg-grain")}
        style={{
          background: "color-mix(in oklab, var(--color-ink-800) 70%, transparent)",
          border: "1px solid var(--color-border)",
          boxShadow: "inset 0 0 0 4px var(--color-bg), inset 0 0 0 5px color-mix(in oklab, var(--color-paper) 10%, transparent)",
        }}
      >
        <p className="font-display text-[15px] leading-relaxed italic" style={{ color: "var(--color-paper)" }}>
          {text}{cursor}
        </p>
      </motion.div>
    );
  }
  if (panel.kind === "action") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(common, "px-5 py-3 relative")}
        style={{
          background: "color-mix(in oklab, var(--color-cyan) 8%, transparent)",
          border: "1px solid color-mix(in oklab, var(--color-cyan) 40%, transparent)",
          clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
        }}
      >
        <span className="absolute top-2 right-3 text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--color-cyan)" }}>ACT</span>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-paper)" }}>{text}{cursor}</p>
      </motion.div>
    );
  }
  if (panel.kind === "dialogue") {
    const avatarUrl = useSpeakerAvatar(panel.speaker);
    return (
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 max-w-[88%]">
        {panel.speaker && <Avatar name={panel.speaker} url={avatarUrl} size={32} />}
        <div className="flex flex-col">
          {panel.speaker && <span className="text-[10px] opacity-70 mb-0.5 ml-2" style={{ color: "var(--color-text-dim)" }}>{panel.speaker}</span>}
          <div
            className="relative px-4 py-2.5 text-sm rounded-2xl"
            style={{
              background: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
              color: "var(--color-void)",
              borderRadius: "18px 18px 18px 4px",
            }}
          >
            {text}{cursor}
          </div>
        </div>
      </motion.div>
    );
  }
  if (panel.kind === "thought") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2 max-w-[80%] ml-auto">
        <div
          className="relative px-4 py-2.5 text-sm italic"
          style={{
            background: "color-mix(in oklab, var(--color-violet) 14%, transparent)",
            color: "var(--color-paper)",
            borderRadius: "22px 22px 4px 22px",
            border: "1px dashed color-mix(in oklab, var(--color-violet) 50%, transparent)",
          }}
        >
          <span className="text-[10px] opacity-60 mr-2 not-italic">{panel.speaker ?? "thought"}</span>
          {text}{cursor}
        </div>
      </motion.div>
    );
  }
  // system
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="self-center text-[11px] tracking-widest uppercase font-mono opacity-70 px-3 py-1 rounded-full"
      style={{ background: "color-mix(in oklab, var(--color-paper) 5%, transparent)", color: "var(--color-text-dim)" }}
    >
      ◇ {text}{cursor}
    </motion.div>
  );
}

/**
 * Resolve a dialogue speaker's avatar URL by looking it up in the active
 * campaign's protagonist + bible.keyCharacters. Returns undefined if no
 * avatar was set for that speaker (Avatar component then falls back to
 * the procedural sigil).
 */
function useSpeakerAvatar(name?: string): string | undefined {
  return useCampaign((s) => {
    if (!name || !s.current) return undefined;
    if (s.current.protagonist.name === name) return s.current.protagonist.avatar;
    return s.current.bible.keyCharacters?.find((k) => k.name === name)?.avatar;
  });
}
