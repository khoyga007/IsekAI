import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Dices, Square, Undo2, Swords, FastForward, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCampaign } from "@/state/campaign";
import { playTurn, parseStory, applyHudOps } from "@/engine/storyEngine";
import { DiceRoller } from "./DiceRoller";
import { useT } from "@/lib/i18n";
import { suggestSkillCheck, rollSkillCheck, formatSkillCheck } from "@/lib/skillCheck";
import { chipBus } from "@/lib/chipBus";

type Mode = "say" | "do" | "think" | "ooc";

const MODES: { key: Mode; glyph: string; accent: string }[] = [
  { key: "say",   glyph: "“ ”", accent: "var(--color-cyan)" },
  { key: "do",    glyph: "▸",   accent: "var(--color-vermillion)" },
  { key: "think", glyph: "~",   accent: "var(--color-violet)" },
  { key: "ooc",   glyph: "[ ]", accent: "var(--color-amber)" },
];

export function InputBar() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("do");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [diceOpen, setDiceOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const campaign = useCampaign((s) => s.current);
  const streaming = useCampaign((s) => s.streaming);
  const beginTurn = useCampaign((s) => s.beginTurn);
  const appendDraftRaw = useCampaign((s) => s.appendDraftRaw);
  const setDraftPanels = useCampaign((s) => s.setDraftPanels);
  const commitTurn = useCampaign((s) => s.commitTurn);
  const addCrystal = useCampaign((s) => s.addCrystal);
  const undoLastScene = useCampaign((s) => s.undoLastScene);

  const disabled = !campaign || streaming;

  // Live skill-check suggestion only in "do" mode.
  const suggestion = useMemo(() => {
    if (mode !== "do" || !campaign) return null;
    return suggestSkillCheck(text, campaign.hud?.widgets ?? [], campaign.protagonist.powerLevel);
  }, [mode, text, campaign]);

  useEffect(() => {
    if (!campaign) return;
    if (campaign.scenes.length === 0 && !streaming) {
      void runTurn(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id]);

  // Listen for chip clicks from StoryView.
  useEffect(() => {
    return chipBus.on((chipText) => {
      if (useCampaign.getState().streaming) return;
      setMode("do");
      void runTurn({ mode: "do", text: chipText });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runTurn(input: { mode: Mode; text: string } | null) {
    setErr(null);
    const c = useCampaign.getState().current;
    if (!c) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    beginTurn();
    try {
      const { raw, parsed } = await playTurn({
        campaign: c,
        input,
        signal: ac.signal,
        onDelta: (acc) => {
          appendDraftRaw(acc.slice(useCampaign.getState().draft?.raw.length ?? 0));
          const partial = parseStory(acc);
          setDraftPanels(partial.panels);
        },
      });

      setDraftPanels(parsed.panels);
      const after = applyHudOps(c, parsed.hudOps);
      await commitTurn(input ?? undefined, undefined, { suggestions: parsed.suggestions, mood: parsed.mood, beat: parsed.beat });
      if (parsed.hudOps.length) {
        useCampaign.setState({ current: { ...after, scenes: useCampaign.getState().current!.scenes } });
      }
      for (const cr of parsed.crystals) {
        await addCrystal({ turn: useCampaign.getState().current!.scenes.length - 1, title: cr.title, summary: cr.summary });
      }
      void raw;
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e?.message ?? String(e));
      useCampaign.setState({ draft: null, streaming: false });
    }
  }

  function send() {
    if (!text.trim() || disabled) return;
    const t2 = text.trim();
    setText("");
    void runTurn({ mode, text: t2 });
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function rollSuggestion() {
    if (!suggestion) return;
    const r = rollSkillCheck(suggestion);
    const formatted = formatSkillCheck(suggestion, r);
    setText((cur) => (cur ? cur + " " : "") + formatted);
  }

  const placeholder = !campaign
    ? t("input.placeholder.empty")
    : streaming
    ? t("input.placeholder.streaming")
    : t(`input.placeholder.${mode}`);

  return (
    <div className="px-8 pb-6">
      {err && (
        <div className="mb-2 text-xs px-3 py-2 rounded-lg max-w-3xl mx-auto"
          style={{ background: "color-mix(in oklab, var(--color-vermillion) 12%, transparent)", color: "var(--color-vermillion-glow)" }}>
          {err}
        </div>
      )}
      <div className="glass-hi rounded-2xl p-3 flex flex-col gap-2 max-w-3xl mx-auto">
        {/* Mode chips */}
        <div className="flex items-center gap-1.5">
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative px-3 py-1 rounded-full text-[11px] font-medium tracking-wide transition flex items-center gap-1.5",
                )}
                style={{
                  color: active ? "var(--color-paper)" : "var(--color-text-dim)",
                  background: active ? "color-mix(in oklab, var(--color-ink-600) 70%, transparent)" : "transparent",
                  boxShadow: active ? `inset 0 0 0 1px ${m.accent}` : "none",
                }}
              >
                <span className="font-mono text-[10px]" style={{ color: m.accent }}>{m.glyph}</span>
                {t(`input.mode.${m.key}`)}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 text-[10px] font-mono" style={{ color: "var(--color-text-dim)" }}>
            <kbd className="px-1.5 py-0.5 rounded glass">⏎</kbd>
            <span>{t("input.send")}</span>
            <span>·</span>
            <kbd className="px-1.5 py-0.5 rounded glass">⇧⏎</kbd>
            <span>{t("input.newline")}</span>
          </div>
        </div>

        {/* Skill-check suggestion strip */}
        <AnimatePresence>
          {suggestion && (
            <motion.button
              key={`${suggestion.family}-${suggestion.statLabel}`}
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              onClick={rollSuggestion}
              disabled={disabled}
              className="self-start flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-full transition disabled:opacity-50"
              style={{
                background: "color-mix(in oklab, var(--color-amber) 12%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-amber) 40%, transparent)",
                color: "var(--color-paper)",
              }}
              title={t("input.skill.suggest")}
            >
              <Swords size={11} style={{ color: "var(--color-amber)" }} />
              <span className="font-display tracking-wide">{t("skill.preview")}</span>
              <span className="opacity-60">·</span>
              <span style={{ color: "var(--color-amber)" }}>{suggestion.statLabel}</span>
              <span className="font-mono opacity-70">{suggestion.expression}</span>
              <span className="opacity-60">·</span>
              <span className="font-mono opacity-70">{t("skill.dc")} {suggestion.dc}</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Textarea row */}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            disabled={disabled}
            rows={2}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:opacity-50 disabled:opacity-50"
            style={{ color: "var(--color-paper)" }}
          />
          <motion.button
            whileTap={{ scale: 0.94 }}
            disabled={!campaign}
            onClick={() => setDiceOpen(true)}
            className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition disabled:opacity-40"
            title={t("input.btn.dice")}
          >
            <Dices size={16} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            disabled={disabled || !campaign?.scenes.length}
            onClick={async () => {
              if (!confirm(t("input.confirm.undo"))) return;
              const restored = await undoLastScene();
              if (restored) { setMode(restored.mode); setText(restored.text); }
            }}
            className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition disabled:opacity-40"
            title={t("input.btn.undo")}
          >
            <Undo2 size={15} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            disabled={disabled || !campaign?.scenes.length}
            onClick={async () => {
              if (!confirm(t("input.confirm.retry"))) return;
              // Pop the last scene (restoring its input) and immediately
              // re-stream with that same input. If the popped scene was an
              // [ADVANCE] turn (no input), re-run as advance.
              const restored = await undoLastScene();
              await runTurn(restored ? { mode: restored.mode, text: restored.text } : null);
            }}
            className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition disabled:opacity-40"
            style={{ color: "var(--color-violet)" }}
            title={t("input.btn.retry")}
          >
            <RotateCcw size={14} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            disabled={disabled || !campaign?.scenes.length}
            onClick={() => void runTurn(null)}
            className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition disabled:opacity-40"
            style={{ color: "var(--color-amber)" }}
            title={t("input.btn.advance")}
          >
            <FastForward size={15} />
          </motion.button>
          {streaming ? (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={stop}
              className="grid place-items-center w-9 h-9 rounded-lg edge-neon-cyan"
              style={{ background: "color-mix(in oklab, var(--color-cyan) 18%, transparent)" }}
              title={t("input.btn.stop")}
            >
              <Square size={14} />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.94 }}
              disabled={disabled || !text.trim()}
              onClick={send}
              className="grid place-items-center w-9 h-9 rounded-lg edge-neon disabled:opacity-40"
              style={{ background: "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" }}
              title={t("input.btn.send")}
            >
              <Send size={16} />
            </motion.button>
          )}
        </div>
      </div>
      <DiceRoller
        open={diceOpen}
        onClose={() => setDiceOpen(false)}
        onApply={(s) => setText((cur) => (cur ? cur + " " : "") + s)}
      />
    </div>
  );
}
