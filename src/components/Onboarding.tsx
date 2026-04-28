import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, BookText, Globe2, Sparkles, Wand2, ArrowRight } from "lucide-react";
import type { Campaign, PowerLevel, SourceKind } from "@/state/types";
import { buildCampaign, type Difficulty } from "@/engine/worldBuilder";
import { suggestPowerLevelFromText } from "@/engine/storyEngine";
import { useCampaign } from "@/state/campaign";
import { useSettings } from "@/state/settings";
import { PROVIDERS } from "@/providers";
import { useT } from "@/lib/i18n";
import { AvatarPicker } from "./AvatarPicker";

interface Props {
  open: boolean;
  initialKind?: SourceKind;
  onClose: () => void;
  onOpenSettings: () => void;
}

const SHAPE: Record<SourceKind, { icon: any; titleKey: string; placeholderKey: string; example: string }> = {
  title: { icon: BookText, titleKey: "onb.title.title", placeholderKey: "onb.title.placeholder", example: "Frieren: Beyond Journey's End" },
  world: { icon: Globe2,   titleKey: "onb.world.title", placeholderKey: "onb.world.placeholder", example: "A floating archipelago where memories are currency. The poor forget their childhoods to buy bread." },
  url:   { icon: Sparkles, titleKey: "onb.url.title",   placeholderKey: "onb.url.placeholder",   example: "https://onepiece.fandom.com/wiki/Monkey_D._Luffy" },
  rng:   { icon: Wand2,    titleKey: "onb.rng.title",   placeholderKey: "onb.rng.placeholder",   example: "something with a melancholy lighthouse keeper" },
};

const DIFFICULTIES: { key: Difficulty; labelKey: string; accent: string }[] = [
  { key: "easy",   labelKey: "onb.diff.easy",   accent: "var(--color-jade)" },
  { key: "normal", labelKey: "onb.diff.normal", accent: "var(--color-cyan)" },
  { key: "hard",   labelKey: "onb.diff.hard",   accent: "var(--color-vermillion)" },
];

const POWER_LEVELS: { key: PowerLevel; titleKey: string; descKey: string; accent: string }[] = [
  { key: "below-average",     titleKey: "power.below-average.title",     descKey: "power.below-average.desc",     accent: "var(--color-text-dim)" },
  { key: "wall-building",     titleKey: "power.wall-building.title",     descKey: "power.wall-building.desc",     accent: "var(--color-cyan)" },
  { key: "city-mountain",     titleKey: "power.city-mountain.title",     descKey: "power.city-mountain.desc",     accent: "var(--color-jade)" },
  { key: "country-continent", titleKey: "power.country-continent.title", descKey: "power.country-continent.desc", accent: "var(--color-amber)" },
  { key: "planet",            titleKey: "power.planet.title",            descKey: "power.planet.desc",            accent: "var(--color-vermillion)" },
  { key: "galaxy-comedic",    titleKey: "power.galaxy-comedic.title",    descKey: "power.galaxy-comedic.desc",    accent: "var(--color-rose)" },
  { key: "universal",         titleKey: "power.universal.title",         descKey: "power.universal.desc",         accent: "var(--color-violet)" },
  { key: "custom",            titleKey: "power.custom.title",            descKey: "power.custom.desc",            accent: "var(--color-text-dim)" },
];

export function Onboarding({ open, initialKind = "title", onClose, onOpenSettings }: Props) {
  const t = useT();
  const [kind, setKind] = useState<SourceKind>(initialKind);
  const [seed, setSeed] = useState("");
  const [hint, setHint] = useState("");
  const [abilities, setAbilities] = useState("");
  const [startingScene, setStartingScene] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  /** undefined = "Auto" (let the engine suggest at runtime). */
  const [powerLevel, setPowerLevel] = useState<PowerLevel | undefined>(undefined);
  const [powerCustom, setPowerCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"world" | "hud" | "protagonist" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Filled after `buildCampaign` succeeds — Onboarding then switches to the
   *  AvatarPicker step before persisting/starting the campaign. */
  const [pendingCampaign, setPendingCampaign] = useState<Campaign | null>(null);

  const start = useCampaign((s) => s.start);
  const settings = useSettings();
  const provider = PROVIDERS[settings.active];
  const cfg = settings.providers[settings.active];
  const ready = !provider.needsKey || !!cfg.apiKey;

  // Live auto-suggestion based on what the player has typed so far.
  const suggestedPower = useMemo(
    () => suggestPowerLevelFromText(`${hint}\n${abilities}\n${seed}`),
    [hint, abilities, seed],
  );
  const effectivePower = powerLevel ?? suggestedPower;

  const reset = () => {
    setSeed(""); setHint(""); setAbilities(""); setStartingScene("");
    setDifficulty("normal"); setPowerLevel(undefined); setPowerCustom("");
    setStage(null);
    setPendingCampaign(null);
  };

  const submit = async () => {
    setErr(null);
    if (!ready) { setErr(t("onb.err.noKey", { provider: provider.label })); return; }
    if (kind !== "rng" && !seed.trim()) return;
    if (powerLevel === "custom" && !powerCustom.trim()) {
      setErr(t("onb.field.power.custom.placeholder"));
      return;
    }
    setBusy(true);
    setStage("world");
    try {
      setTimeout(() => setStage("hud"), 4000);
      setTimeout(() => setStage("protagonist"), 8000);
      const campaign = await buildCampaign({
        source: { kind, input: seed.trim() },
        protagonistHint: hint.trim() || undefined,
        abilitiesHint: abilities.trim() || undefined,
        startingSceneHint: startingScene.trim() || undefined,
        difficulty,
        powerLevel,
        powerCustom: powerLevel === "custom" ? powerCustom.trim() : undefined,
      });
      // Hand off to AvatarPicker — the caller will finalize via finalize() below.
      setPendingCampaign(campaign);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  /** Apply chosen avatars to the pending campaign and start it. */
  const finalize = async (avatars: { protagonist?: string; keyCharacters: Record<string, string | undefined> }) => {
    if (!pendingCampaign) return;
    const next: Campaign = {
      ...pendingCampaign,
      protagonist: { ...pendingCampaign.protagonist, avatar: avatars.protagonist ?? pendingCampaign.protagonist.avatar },
      bible: {
        ...pendingCampaign.bible,
        keyCharacters: (pendingCampaign.bible.keyCharacters ?? []).map((kc) => ({
          ...kc,
          avatar: avatars.keyCharacters[kc.name] ?? kc.avatar,
        })),
      },
    };
    await start(next);
    onClose();
    reset();
  };

  /** Skip the picker entirely — start with whatever avatars (if any) the world
   *  builder pre-fetched. Today that's none, so everyone falls back to sigils. */
  const skipPicker = async () => {
    if (!pendingCampaign) return;
    await start(pendingCampaign);
    onClose();
    reset();
  };

  /** Cancel the picker — discard pending campaign, return to onboarding form. */
  const cancelPicker = () => setPendingCampaign(null);

  const cur = SHAPE[kind];
  const Icon = cur.icon;

  const inputStyle = {
    background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
    border: "1px solid var(--color-border)",
    color: "var(--color-paper)",
  };
  const inputCls = "w-full bg-transparent px-3 py-2 rounded-lg outline-none text-sm";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
            className="fixed inset-0 z-40"
            style={{ background: "color-mix(in oklab, var(--color-void) 75%, transparent)", backdropFilter: "blur(8px)" }}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed inset-0 z-50 grid place-items-center pointer-events-none"
          >
            {pendingCampaign ? (
              <AvatarPicker
                campaign={pendingCampaign}
                sourceKind={kind}
                onConfirm={finalize}
                onSkip={skipPicker}
                onCancel={cancelPicker}
              />
            ) : (
            <div className="pointer-events-auto w-[720px] max-w-[94vw] glass-hi rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center w-10 h-10 rounded-lg edge-neon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>{t("onb.heading")}</div>
                    <h2 className="font-display text-xl">{t(cur.titleKey)}</h2>
                  </div>
                </div>
                <button onClick={onClose} disabled={busy} className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition disabled:opacity-30">
                  <X size={16} />
                </button>
              </div>

              <div className="brush-divider mx-6 flex-shrink-0" style={{ color: "color-mix(in oklab, var(--color-vermillion) 30%, transparent)" }} />

              {/* Source tabs */}
              <div className="px-6 pt-4 flex gap-2 flex-wrap flex-shrink-0">
                {(Object.keys(SHAPE) as SourceKind[]).map(k => {
                  const I = SHAPE[k].icon;
                  const isSel = k === kind;
                  return (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      disabled={busy}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition disabled:opacity-50"
                      style={{
                        background: isSel ? "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                        boxShadow: isSel ? "inset 0 0 0 1px var(--color-vermillion)" : "inset 0 0 0 1px var(--color-border)",
                        color: isSel ? "var(--color-paper)" : "var(--color-text-dim)",
                      }}
                    >
                      <I size={12} />
                      {t(SHAPE[k].titleKey)}
                    </button>
                  );
                })}
              </div>

              {/* Scrollable body */}
              <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">

                {/* Seed */}
                {kind !== "rng" && (
                  <Field label={t("onb.field.seed")}>
                    {kind === "world" ? (
                      <textarea
                        value={seed} onChange={(e) => setSeed(e.target.value)}
                        disabled={busy} rows={3}
                        placeholder={t(cur.placeholderKey)}
                        className={inputCls + " resize-none leading-relaxed"}
                        style={inputStyle}
                      />
                    ) : (
                      <input
                        value={seed} onChange={(e) => setSeed(e.target.value)}
                        disabled={busy}
                        placeholder={t(cur.placeholderKey)}
                        className={inputCls} style={inputStyle}
                      />
                    )}
                    <button
                      onClick={() => setSeed(cur.example)} disabled={busy}
                      className="mt-1 text-[10px] opacity-60 hover:opacity-100 transition self-start"
                      style={{ color: "var(--color-cyan)" }}
                    >
                      {t("onb.try")} "{cur.example}"
                    </button>
                  </Field>
                )}

                {/* Protagonist */}
                <Field label={t("onb.field.protagonist")} hint={t("onb.field.protagonist.hint")}>
                  <input
                    value={hint} onChange={(e) => setHint(e.target.value)}
                    disabled={busy}
                    placeholder={t("onb.field.protagonist.placeholder")}
                    className={inputCls} style={inputStyle}
                  />
                </Field>

                {/* Abilities */}
                <Field label={t("onb.field.abilities")} hint={t("onb.field.abilities.hint")}>
                  <input
                    value={abilities} onChange={(e) => setAbilities(e.target.value)}
                    disabled={busy}
                    placeholder={t("onb.field.abilities.placeholder")}
                    className={inputCls} style={inputStyle}
                  />
                </Field>

                {/* Starting scene */}
                <Field label={t("onb.field.startScene")} hint={t("onb.field.startScene.hint")}>
                  <textarea
                    value={startingScene} onChange={(e) => setStartingScene(e.target.value)}
                    disabled={busy} rows={2}
                    placeholder={t("onb.field.startScene.placeholder")}
                    className={inputCls + " resize-none"}
                    style={inputStyle}
                  />
                </Field>

                {/* Difficulty */}
                <Field label={t("onb.field.difficulty")}>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map((d) => {
                      const sel = d.key === difficulty;
                      return (
                        <button
                          key={d.key}
                          onClick={() => setDifficulty(d.key)}
                          disabled={busy}
                          className="flex-1 py-2 rounded-lg text-xs font-medium transition disabled:opacity-50"
                          style={{
                            background: sel ? `color-mix(in oklab, ${d.accent} 15%, transparent)` : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                            boxShadow: sel ? `inset 0 0 0 1px ${d.accent}` : "inset 0 0 0 1px var(--color-border)",
                            color: sel ? d.accent : "var(--color-text-dim)",
                          }}
                        >
                          {t(d.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--color-text-dim)" }}>{t(`onb.diff.${difficulty}.hint`)}</p>
                </Field>

                {/* Power Level */}
                <Field label={t("onb.field.power")} hint={t("onb.field.power.hint")}>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Auto chip — first slot */}
                    <button
                      onClick={() => setPowerLevel(undefined)}
                      disabled={busy}
                      className="text-left py-2 px-3 rounded-lg text-[11px] transition disabled:opacity-50"
                      style={{
                        background: powerLevel === undefined ? "color-mix(in oklab, var(--color-cyan) 15%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                        boxShadow: powerLevel === undefined ? "inset 0 0 0 1px var(--color-cyan)" : "inset 0 0 0 1px var(--color-border)",
                        color: powerLevel === undefined ? "var(--color-paper)" : "var(--color-text-dim)",
                      }}
                    >
                      <div className="font-medium">Auto</div>
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {t("onb.field.power.suggested")}: {t(`power.${suggestedPower}.title`)}
                      </div>
                    </button>
                    {POWER_LEVELS.map((p) => {
                      const sel = powerLevel === p.key;
                      return (
                        <button
                          key={p.key}
                          onClick={() => setPowerLevel(p.key)}
                          disabled={busy}
                          className="text-left py-2 px-3 rounded-lg text-[11px] transition disabled:opacity-50"
                          style={{
                            background: sel ? `color-mix(in oklab, ${p.accent} 15%, transparent)` : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                            boxShadow: sel ? `inset 0 0 0 1px ${p.accent}` : "inset 0 0 0 1px var(--color-border)",
                            color: sel ? "var(--color-paper)" : "var(--color-text-dim)",
                          }}
                        >
                          <div className="font-medium" style={{ color: sel ? p.accent : undefined }}>{t(p.titleKey)}</div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Description of currently-effective power */}
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-dim)" }}>
                    {t(`power.${effectivePower}.desc`)}
                  </p>
                  {/* Custom textarea — only when custom is selected */}
                  {powerLevel === "custom" && (
                    <textarea
                      value={powerCustom}
                      onChange={(e) => setPowerCustom(e.target.value)}
                      disabled={busy}
                      rows={3}
                      placeholder={t("onb.field.power.custom.placeholder")}
                      className={inputCls + " resize-none mt-2 leading-relaxed"}
                      style={inputStyle}
                    />
                  )}
                </Field>

                {err && (
                  <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "color-mix(in oklab, var(--color-vermillion) 12%, transparent)", color: "var(--color-vermillion-glow)" }}>
                    {err}
                    {!ready && <button onClick={onOpenSettings} className="ml-2 underline">{t("onb.openSettings")}</button>}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 flex items-center justify-between flex-shrink-0 border-t" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--color-text-dim)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ready ? "var(--color-jade)" : "var(--color-vermillion)" }} />
                  <span>{t("onb.via")} {provider.label}</span>
                </div>
                <button
                  onClick={submit}
                  disabled={busy || (kind !== "rng" && !seed.trim())}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full edge-neon text-sm font-medium disabled:opacity-50"
                  style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)", color: "var(--color-paper)" }}
                >
                  {busy ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{stage === "world" ? t("onb.btn.weaving") : stage === "hud" ? t("onb.btn.forging") : stage === "protagonist" ? t("onb.btn.summoning") : t("onb.btn.working")}</span>
                    </>
                  ) : (
                    <>{t("onb.btn.begin")} <ArrowRight size={14} /></>
                  )}
                </button>
              </div>
            </div>
            )}
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
