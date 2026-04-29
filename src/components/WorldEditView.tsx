import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { useT } from "@/lib/i18n";
import { suggestPowerLevelFromText } from "@/engine/storyEngine";
import type { HudWidget, WorldBible, Protagonist, PowerLevel } from "@/state/types";

const POWER_LEVELS: { key: PowerLevel; titleKey: string; accent: string }[] = [
  { key: "below-average",     titleKey: "power.below-average.title",     accent: "var(--color-text-dim)" },
  { key: "wall-building",     titleKey: "power.wall-building.title",     accent: "var(--color-cyan)" },
  { key: "city-mountain",     titleKey: "power.city-mountain.title",     accent: "var(--color-jade)" },
  { key: "country-continent", titleKey: "power.country-continent.title", accent: "var(--color-amber)" },
  { key: "planet",            titleKey: "power.planet.title",            accent: "var(--color-vermillion)" },
  { key: "galaxy-comedic",    titleKey: "power.galaxy-comedic.title",    accent: "var(--color-rose)" },
  { key: "universal",         titleKey: "power.universal.title",         accent: "var(--color-violet)" },
  { key: "custom",            titleKey: "power.custom.title",            accent: "var(--color-text-dim)" },
];

interface Props { open: boolean; onClose: () => void; }

type Tab = "bible" | "protagonist" | "hud";

export function WorldEditView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);
  const saveCurrent = useCampaign((s) => s.saveCurrent);
  const [tab, setTab] = useState<Tab>("bible");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local editable copies
  const [bible, setBible] = useState<WorldBible | null>(null);
  const [protagonist, setProtagonist] = useState<Protagonist | null>(null);
  const [widgets, setWidgets] = useState<HudWidget[] | null>(null);

  // Init local state when drawer opens / campaign changes
  const localBible = bible ?? c?.bible ?? null;
  const localProto = protagonist ?? c?.protagonist ?? null;
  const localWidgets = widgets ?? c?.hud?.widgets ?? [];

  if (!c) {
    return (
      <Drawer open={open} onClose={onClose} title={t("wedit.title")} subtitle="—" width={600}>
        <div className="text-sm py-8 text-center" style={{ color: "var(--color-text-dim)" }}>
          {t("wedit.noCampaign")}
        </div>
      </Drawer>
    );
  }

  const isDirty = bible !== null || protagonist !== null || widgets !== null;

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const cur = useCampaign.getState().current;
      if (!cur) return;
      const next = {
        ...cur,
        bible: localBible!,
        protagonist: localProto!,
        hud: { ...cur.hud, widgets: localWidgets },
        updatedAt: Date.now(),
      };
      useCampaign.setState({ current: next });
      await saveCurrent();
      setBible(null);
      setProtagonist(null);
      setWidgets(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "bible", label: t("wedit.tab.bible") },
    { key: "protagonist", label: t("wedit.tab.protagonist") },
    { key: "hud", label: t("wedit.tab.hud") },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("wedit.title")}
      subtitle={c.bible.title}
      width={620}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px]" style={{ color: isDirty ? "var(--color-amber)" : "var(--color-text-dim)" }}>
            {isDirty ? t("wedit.unsaved") : saved ? t("wedit.saved") : t("wedit.hint")}
          </span>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-full edge-neon text-sm disabled:opacity-40"
            style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)" }}
          >
            <Save size={13} />
            {saving ? t("wedit.btn.saving") : t("wedit.btn.save")}
          </button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className="px-3 py-1.5 rounded-full text-xs transition"
              style={{
                background: active ? "color-mix(in oklab, var(--color-vermillion) 18%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                boxShadow: active ? "inset 0 0 0 1px var(--color-vermillion)" : "inset 0 0 0 1px var(--color-border)",
                color: active ? "var(--color-paper)" : "var(--color-text-dim)",
              }}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === "bible" && localBible && (
          <motion.div key="bible" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex flex-col gap-4">
            <Field label={t("wedit.field.title")}>
              <input value={localBible.title} onChange={(e) => setBible({ ...localBible, title: e.target.value })} className={inputCls} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("wedit.field.genre")}>
                <input value={localBible.genre} onChange={(e) => setBible({ ...localBible, genre: e.target.value })} className={inputCls} style={inputStyle} />
              </Field>
              <Field label={t("wedit.field.tone")}>
                <input value={localBible.tone} onChange={(e) => setBible({ ...localBible, tone: e.target.value })} className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <Field label={t("wedit.field.setting")}>
              <textarea value={localBible.setting} onChange={(e) => setBible({ ...localBible, setting: e.target.value })} rows={4} className={inputCls + " resize-none"} style={inputStyle} />
            </Field>
            <Field label={t("wedit.field.rules")}>
              <ListEditor
                items={localBible.rules ?? []}
                onChange={(rules) => setBible({ ...localBible, rules })}
                placeholder={t("wedit.field.rules.placeholder")}
              />
            </Field>
            <Field label={t("wedit.field.factions")}>
              <KVEditor
                items={(localBible.factions ?? []).map(f => ({ key: f.name, value: f.desc }))}
                onChange={(items) => setBible({ ...localBible, factions: items.map(i => ({ name: i.key, desc: i.value })) })}
                keyLabel={t("wedit.field.name")}
                valueLabel={t("wedit.field.desc")}
              />
            </Field>
            <Field label={t("wedit.field.keyChars")}>
              <KeyCharEditor
                chars={localBible.keyCharacters ?? []}
                onChange={(kc) => setBible({ ...localBible, keyCharacters: kc })}
              />
            </Field>
          </motion.div>
        )}

        {tab === "protagonist" && localProto && (
          <motion.div key="proto" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex flex-col gap-4">
            <Field label={t("wedit.field.name")}>
              <input value={localProto.name} onChange={(e) => setProtagonist({ ...localProto, name: e.target.value })} className={inputCls} style={inputStyle} />
            </Field>
            <Field label={t("wedit.field.role")}>
              <input value={localProto.role} onChange={(e) => setProtagonist({ ...localProto, role: e.target.value })} className={inputCls} style={inputStyle} />
            </Field>
            <Field label={t("wedit.field.desc")}>
              <textarea value={localProto.description} onChange={(e) => setProtagonist({ ...localProto, description: e.target.value })} rows={5} className={inputCls + " resize-none"} style={inputStyle} />
            </Field>
            <PowerLevelEditor
              proto={localProto}
              onChange={(p) => setProtagonist(p)}
              t={t}
            />
          </motion.div>
        )}

        {tab === "hud" && (
          <motion.div key="hud" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex flex-col gap-3">
            {localWidgets.length === 0 && (
              <div className="text-xs py-4 text-center" style={{ color: "var(--color-text-dim)" }}>{t("wedit.hud.empty")}</div>
            )}
            {localWidgets.map((w, idx) => (
              <WidgetEditor key={w.id} widget={w} onChange={(nw) => {
                const next = [...localWidgets];
                next[idx] = nw;
                setWidgets(next);
              }} onDelete={() => {
                const next = localWidgets.filter((_, i) => i !== idx);
                setWidgets(next);
              }} />
            ))}
            <p className="text-[11px] text-center mt-1" style={{ color: "var(--color-text-dim)" }}>{t("wedit.hud.hint")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Drawer>
  );
}

/* ---- Sub-editors ---- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--color-text-dim)" }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-transparent px-3 py-2 rounded-lg outline-none text-sm";
const inputStyle = {
  background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
  border: "1px solid var(--color-border)",
  color: "var(--color-paper)",
};

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={item}
            onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
            className={inputCls + " flex-1"}
            style={inputStyle}
            placeholder={placeholder}
          />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="grid place-items-center w-8 h-8 rounded-lg glass hover:glass-hi transition flex-shrink-0" style={{ color: "var(--color-vermillion)" }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])} className="self-start flex items-center gap-1.5 text-xs mt-1 px-3 py-1.5 rounded-full glass hover:glass-hi transition" style={{ color: "var(--color-cyan)" }}>
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function PowerLevelEditor({
  proto,
  onChange,
  t,
}: {
  proto: Protagonist;
  onChange: (p: Protagonist) => void;
  t: (key: string) => string;
}) {
  const suggested = suggestPowerLevelFromText(`${proto.role}\n${proto.description}`);
  const effective = proto.powerLevel ?? suggested;
  return (
    <Field label={t("wedit.field.power")}>
      <p className="text-[11px] -mt-1 mb-1.5" style={{ color: "var(--color-text-dim)" }}>{t("wedit.field.power.hint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onChange({ ...proto, powerLevel: undefined, powerCustom: undefined })}
          className="text-left py-2 px-3 rounded-lg text-[11px] transition"
          style={{
            background: proto.powerLevel === undefined ? "color-mix(in oklab, var(--color-cyan) 15%, transparent)" : "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
            boxShadow: proto.powerLevel === undefined ? "inset 0 0 0 1px var(--color-cyan)" : "inset 0 0 0 1px var(--color-border)",
            color: proto.powerLevel === undefined ? "var(--color-paper)" : "var(--color-text-dim)",
          }}
        >
          <div className="font-medium">Auto</div>
          <div className="text-[10px] opacity-70 mt-0.5">
            {t("onb.field.power.suggested")}: {t(`power.${suggested}.title`)}
          </div>
        </button>
        {POWER_LEVELS.map((p) => {
          const sel = proto.powerLevel === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onChange({ ...proto, powerLevel: p.key, ...(p.key !== "custom" ? { powerCustom: undefined } : {}) })}
              className="text-left py-2 px-3 rounded-lg text-[11px] transition"
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
      <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-dim)" }}>
        {t(`power.${effective}.desc`)}
      </p>
      {proto.powerLevel === "custom" && (
        <textarea
          value={proto.powerCustom ?? ""}
          onChange={(e) => onChange({ ...proto, powerCustom: e.target.value })}
          rows={3}
          placeholder={t("onb.field.power.custom.placeholder")}
          className={inputCls + " resize-none mt-2 leading-relaxed"}
          style={inputStyle}
        />
      )}
    </Field>
  );
}

function KVEditor({ items, onChange, keyLabel, valueLabel }: { items: { key: string; value: string }[]; onChange: (v: { key: string; value: string }[]) => void; keyLabel: string; valueLabel: string }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="glass rounded-lg p-2.5 flex flex-col gap-1.5">
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>{keyLabel}</div>
              <input value={item.key} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], key: e.target.value }; onChange(n); }} className={inputCls} style={inputStyle} />
            </div>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="self-end grid place-items-center w-8 h-8 rounded-lg glass hover:glass-hi transition flex-shrink-0" style={{ color: "var(--color-vermillion)" }}>
              <Trash2 size={13} />
            </button>
          </div>
          <div>
            <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>{valueLabel}</div>
            <input value={item.value} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], value: e.target.value }; onChange(n); }} className={inputCls} style={inputStyle} />
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...items, { key: "", value: "" }])} className="self-start flex items-center gap-1.5 text-xs mt-1 px-3 py-1.5 rounded-full glass hover:glass-hi transition" style={{ color: "var(--color-cyan)" }}>
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

type KeyChar = WorldBible["keyCharacters"][number];

function KeyCharEditor({ chars, onChange }: { chars: KeyChar[]; onChange: (v: KeyChar[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {chars.map((ch, i) => (
        <div key={i} className="glass rounded-lg p-2.5 flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input placeholder="Name" value={ch.name} onChange={(e) => { const n = [...chars]; n[i] = { ...n[i], name: e.target.value }; onChange(n); }} className={inputCls + " flex-1"} style={inputStyle} />
            <input placeholder="Role" value={ch.role} onChange={(e) => { const n = [...chars]; n[i] = { ...n[i], role: e.target.value }; onChange(n); }} className={inputCls + " flex-1"} style={inputStyle} />
            <button onClick={() => onChange(chars.filter((_, j) => j !== i))} className="self-end grid place-items-center w-8 h-8 rounded-lg glass hover:glass-hi transition flex-shrink-0" style={{ color: "var(--color-vermillion)" }}>
              <Trash2 size={13} />
            </button>
          </div>
          <textarea placeholder="Description" value={ch.desc} onChange={(e) => { const n = [...chars]; n[i] = { ...n[i], desc: e.target.value }; onChange(n); }} rows={2} className={inputCls + " resize-none"} style={inputStyle} />
          <div className="flex gap-2">
            <input
              placeholder="Register (terse / ornate / rustic / scholarly / ...)"
              value={ch.register ?? ""}
              onChange={(e) => { const n = [...chars]; n[i] = { ...n[i], register: e.target.value }; onChange(n); }}
              className={inputCls + " flex-1"}
              style={inputStyle}
            />
            <input
              placeholder='Tic (e.g. "Trails off mid-sentence")'
              value={ch.tic ?? ""}
              onChange={(e) => { const n = [...chars]; n[i] = { ...n[i], tic: e.target.value }; onChange(n); }}
              className={inputCls + " flex-[2]"}
              style={inputStyle}
            />
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...chars, { name: "", role: "", desc: "" }])} className="self-start flex items-center gap-1.5 text-xs mt-1 px-3 py-1.5 rounded-full glass hover:glass-hi transition" style={{ color: "var(--color-cyan)" }}>
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function WidgetEditor({ widget, onChange, onDelete }: { widget: HudWidget; onChange: (w: HudWidget) => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:glass-hi transition"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest" style={{ background: "color-mix(in oklab, var(--color-cyan) 15%, transparent)", color: "var(--color-cyan)" }}>{widget.type}</span>
        <span className="flex-1 text-sm" style={{ color: "var(--color-paper)" }}>{widget.label} <span className="opacity-40 font-mono text-[11px]">#{widget.id}</span></span>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="grid place-items-center w-7 h-7 rounded-lg transition hover:glass" style={{ color: "var(--color-vermillion)" }}>
          <Trash2 size={12} />
        </button>
        {expanded ? <ChevronUp size={14} style={{ color: "var(--color-text-dim)" }} /> : <ChevronDown size={14} style={{ color: "var(--color-text-dim)" }} />}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <div className="pt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] tracking-widest uppercase mb-1 mt-1" style={{ color: "var(--color-text-dim)" }}>Label</div>
                  <input value={widget.label} onChange={(e) => onChange({ ...widget, label: e.target.value })} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <div className="text-[9px] tracking-widest uppercase mb-1 mt-1" style={{ color: "var(--color-text-dim)" }}>Accent</div>
                  <input value={widget.accent ?? ""} onChange={(e) => onChange({ ...widget, accent: e.target.value })} className={inputCls} style={inputStyle} placeholder="e.g. vermillion, cyan" />
                </div>
              </div>
              {widget.type === "stat-bar" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>Value</div>
                    <input type="number" value={widget.value} onChange={(e) => onChange({ ...widget, value: Number(e.target.value) })} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>Max</div>
                    <input type="number" value={widget.max} onChange={(e) => onChange({ ...widget, max: Number(e.target.value) })} className={inputCls} style={inputStyle} />
                  </div>
                </div>
              )}
              {widget.type === "stat-number" && (
                <div>
                  <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>Value</div>
                  <input value={String(widget.value)} onChange={(e) => onChange({ ...widget, value: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })} className={inputCls} style={inputStyle} />
                </div>
              )}
              {widget.type === "note" && (
                <div>
                  <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>Body</div>
                  <textarea value={widget.body} onChange={(e) => onChange({ ...widget, body: e.target.value })} rows={3} className={inputCls + " resize-none"} style={inputStyle} />
                </div>
              )}
              {widget.type === "tag-list" && (
                <div>
                  <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: "var(--color-text-dim)" }}>Tags (comma-separated)</div>
                  <input value={(widget.tags ?? []).join(", ")} onChange={(e) => onChange({ ...widget, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} className={inputCls} style={inputStyle} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
