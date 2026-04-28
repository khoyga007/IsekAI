import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Check } from "lucide-react";
import { useState } from "react";
import { PROVIDER_LIST, PROVIDERS } from "@/providers";
import type { ProviderId } from "@/providers";
import { useSettings } from "@/state/settings";
import { cn } from "@/lib/cn";
import { useT, type Lang } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const t = useT();
  const active = useSettings((s) => s.active);
  const fallback = useSettings((s) => s.fallback);
  const providers = useSettings((s) => s.providers);
  const setActive = useSettings((s) => s.setActive);
  const setFallback = useSettings((s) => s.setFallback);
  const setProvider = useSettings((s) => s.setProvider);
  const lowFx = useSettings((s) => s.ui.lowFx);
  const setLowFx = useSettings((s) => s.setLowFx);
  const audio = useSettings((s) => s.ui.audio);
  const audioVolume = useSettings((s) => s.ui.audioVolume);
  const setAudio = useSettings((s) => s.setAudio);
  const setAudioVolume = useSettings((s) => s.setAudioVolume);
  const lang = useSettings((s) => s.ui.lang);
  const setLang = useSettings((s) => s.setLang);
  const typewriter = useSettings((s) => s.ui.typewriter);
  const setTypewriter = useSettings((s) => s.setTypewriter);

  const [editId, setEditId] = useState<ProviderId>(active);
  const [reveal, setReveal] = useState(false);
  const editing = PROVIDERS[editId];
  const cfg = providers[editId];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "color-mix(in oklab, var(--color-void) 70%, transparent)", backdropFilter: "blur(6px)" }}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed right-0 top-0 bottom-0 w-[640px] max-w-[95vw] z-50 glass-hi flex flex-col"
            style={{ borderLeft: "1px solid var(--color-border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("settings.title")}</div>
                <h2 className="font-display text-2xl mt-0.5">{t("settings.providers")}</h2>
              </div>
              <button onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition">
                <X size={16} />
              </button>
            </div>

            <div className="brush-divider mx-6" style={{ color: "color-mix(in oklab, var(--color-vermillion) 30%, transparent)" }} />

            <div className="flex-1 grid grid-cols-[200px_1fr] overflow-hidden">
              {/* Provider list */}
              <div className="border-r overflow-y-auto p-2 flex flex-col gap-0.5" style={{ borderColor: "var(--color-border)" }}>
                {PROVIDER_LIST.map((p) => {
                  const isEdit = editId === p.id;
                  const isActive = active === p.id;
                  const isFallback = fallback === p.id;
                  const ready = !p.needsKey || !!providers[p.id]?.apiKey;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setEditId(p.id)}
                      className={cn(
                        "relative text-left px-2.5 py-1.5 rounded-lg transition flex items-center justify-between",
                        isEdit ? "glass" : "hover:glass",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-xs truncate" style={{ color: "var(--color-paper)" }}>{p.label}</div>
                      </div>
                      <div className="flex items-center gap-1.5 ml-1 shrink-0">
                        {isActive && <Check size={10} style={{ color: "var(--color-vermillion)" }} />}
                        {isFallback && (
                          <span className="font-mono text-[8px] tracking-widest" style={{ color: "var(--color-cyan)" }}>F</span>
                        )}
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: ready ? "var(--color-jade)" : "var(--color-text-dim)",
                            boxShadow: ready ? "0 0 8px var(--color-jade)" : undefined,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Provider editor */}
              <div className="overflow-y-auto p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg flex-1 truncate">{editing.label}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActive(editing.id)}
                      disabled={editing.id === active}
                      className="text-xs px-3 py-1.5 rounded-full edge-neon disabled:opacity-50"
                      style={{ background: "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" }}
                    >
                      {editing.id === active ? t("settings.active") : t("settings.useThis")}
                    </button>
                    <button
                      onClick={() => setFallback(fallback === editing.id ? null : editing.id)}
                      disabled={editing.id === active}
                      title={t("settings.fallback.hint")}
                      className="text-xs px-3 py-1.5 rounded-full transition disabled:opacity-30"
                      style={{
                        background: fallback === editing.id ? "color-mix(in oklab, var(--color-cyan) 18%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                        boxShadow: fallback === editing.id ? "inset 0 0 0 1px var(--color-cyan)" : "inset 0 0 0 1px var(--color-border)",
                        color: fallback === editing.id ? "var(--color-paper)" : "var(--color-text-dim)",
                      }}
                    >
                      {fallback === editing.id ? t("settings.fallback.is") : t("settings.fallback.set")}
                    </button>
                  </div>
                </div>

                {editing.needsKey && (
                  <Field label={t("settings.field.apiKey")} hint={t("settings.field.apiKey.hint")}>
                    <div className="flex items-center gap-2">
                      <input
                        type={reveal ? "text" : "password"}
                        value={cfg.apiKey ?? ""}
                        onChange={(e) => setProvider(editing.id, { apiKey: e.target.value })}
                        placeholder={`${editing.label} key…`}
                        className="flex-1 bg-transparent px-3 py-2 rounded-lg outline-none text-sm font-mono"
                        style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
                      />
                      <button onClick={() => setReveal(!reveal)} className="grid place-items-center w-9 h-9 rounded-lg glass">
                        {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </Field>
                )}

                <Field label={t("settings.field.baseUrl")} hint={t("settings.field.baseUrl.hint")}>
                  <input
                    type="text"
                    value={cfg.baseUrl ?? ""}
                    onChange={(e) => setProvider(editing.id, { baseUrl: e.target.value })}
                    placeholder="(default)"
                    className="w-full bg-transparent px-3 py-2 rounded-lg outline-none text-sm font-mono"
                    style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
                  />
                </Field>

                <Field label={t("settings.field.model")} hint={t("settings.field.model.hint")}>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={cfg.model ?? ""}
                      onChange={(e) => setProvider(editing.id, { model: e.target.value })}
                      className="w-full bg-transparent px-3 py-2 rounded-lg outline-none text-sm font-mono"
                      style={{ background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)", border: "1px solid var(--color-border)", color: "var(--color-paper)" }}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {editing.defaultModels.map((m) => {
                        const isSel = cfg.model === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => setProvider(editing.id, { model: m.id })}
                            className="text-[11px] px-2.5 py-1 rounded-full transition"
                            style={{
                              background: isSel ? "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                              boxShadow: isSel ? "inset 0 0 0 1px var(--color-vermillion)" : "inset 0 0 0 1px var(--color-border)",
                              color: isSel ? "var(--color-paper)" : "var(--color-text-dim)",
                            }}
                            title={m.hint}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Field>

                {/* UI prefs (only show on first provider tab to keep things tidy) */}
                <div className="mt-2 pt-5 flex flex-col gap-4" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <Field label={t("settings.field.lang")} hint={t("settings.field.lang.hint")}>
                    <div className="flex gap-2">
                      {(["en", "vi"] as Lang[]).map((l) => {
                        const sel = lang === l;
                        return (
                          <button
                            key={l}
                            onClick={() => setLang(l)}
                            className="text-xs px-3 py-1.5 rounded-full transition flex items-center gap-1.5"
                            style={{
                              background: sel ? "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                              boxShadow: sel ? "inset 0 0 0 1px var(--color-vermillion)" : "inset 0 0 0 1px var(--color-border)",
                              color: sel ? "var(--color-paper)" : "var(--color-text-dim)",
                            }}
                          >
                            <span className="font-mono text-[10px]">{l.toUpperCase()}</span>
                            <span>{l === "en" ? "English" : "Tiếng Việt"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label={t("settings.field.perf")} hint={t("settings.field.perf.hint")}>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lowFx}
                        onChange={(e) => setLowFx(e.target.checked)}
                        className="accent-pink-500"
                      />
                      {t("settings.field.perf.label")}
                    </label>
                  </Field>
                  <Field label={t("settings.field.typewriter")} hint={t("settings.field.typewriter.hint")}>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={typewriter}
                        onChange={(e) => setTypewriter(e.target.checked)}
                        className="accent-pink-500"
                      />
                      {t("settings.field.typewriter.label")}
                    </label>
                  </Field>
                  <Field label={t("settings.field.audio")} hint={t("settings.field.audio.hint")}>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={audio}
                          onChange={(e) => setAudio(e.target.checked)}
                          className="accent-pink-500"
                        />
                        {t("settings.field.audio.label")}
                      </label>
                      <input
                        type="range"
                        min={0} max={0.4} step={0.01}
                        value={audioVolume}
                        onChange={(e) => setAudioVolume(Number(e.target.value))}
                        disabled={!audio}
                        className="flex-1 accent-pink-500"
                      />
                      <span className="text-[10px] font-mono w-8 text-right" style={{ color: "var(--color-text-dim)" }}>
                        {Math.round(audioVolume * 250)}
                      </span>
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px]" style={{ color: "var(--color-text-dim)" }}>{hint}</p>}
    </div>
  );
}
