import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { Avatar } from "@/lib/avatar";
import { useT } from "@/lib/i18n";

interface Props { open: boolean; onClose: () => void; }

export function CastView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);

  // Discover speakers organically from played scenes — these may include
  // characters the world bible never named.
  const seen = new Set<string>();
  c?.scenes.forEach((s) => s.panels.forEach((p) => { if (p.speaker) seen.add(p.speaker); }));
  const fromBible = new Map(c?.bible?.keyCharacters?.map((k) => [k.name, k]) ?? []);
  const all: { name: string; role?: string; desc?: string; avatar?: string; met: boolean }[] = [];
  fromBible.forEach((v, name) => all.push({ name, role: v.role, desc: v.desc, avatar: v.avatar, met: seen.has(name) }));
  seen.forEach((n) => { if (!fromBible.has(n)) all.push({ name: n, met: true }); });

  return (
    <Drawer open={open} onClose={onClose} title={t("cast.title")} subtitle={c?.bible.title ?? "—"} width={560}>
      {!c ? (
        <Empty msg={t("cast.noCampaign")} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Protagonist */}
          <section>
            <SectionHeader label={t("cast.protagonist")} />
            <CharCard
              name={c.protagonist.name}
              role={c.protagonist.role}
              desc={c.protagonist.description}
              avatar={c.protagonist.avatar}
              you
            />
          </section>

          {/* Cast */}
          <section>
            <SectionHeader label={`${t("cast.worldCast")} · ${all.length}`} />
            {all.length === 0 ? (
              <Empty msg={t("cast.empty")} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {all.map((p) => (
                  <CharCard key={p.name} name={p.name} role={p.role} desc={p.desc} avatar={p.avatar} met={p.met} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function CharCard({ name, role, desc, avatar, you, met }: { name: string; role?: string; desc?: string; avatar?: string; you?: boolean; met?: boolean }) {
  const t = useT();
  return (
    <div className="glass rounded-xl p-3 flex items-start gap-3" style={{ boxShadow: you ? "inset 0 0 0 1px var(--color-vermillion)" : undefined }}>
      <Avatar name={name} url={avatar} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm" style={{ color: "var(--color-paper)" }}>{name}</span>
          {you && <Tag color="var(--color-vermillion)">{t("cast.you")}</Tag>}
          {met === true && !you && <Tag color="var(--color-jade)">{t("cast.met")}</Tag>}
          {met === false && <Tag color="var(--color-text-dim)">{t("cast.unmet")}</Tag>}
        </div>
        {role && <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-dim)" }}>{role}</div>}
        {desc && <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: "var(--color-text-dim)" }}>{desc}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <div className="text-[10px] tracking-[0.4em] uppercase mb-2" style={{ color: "var(--color-text-dim)" }}>{label}</div>;
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-widest"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
      {children}
    </span>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm py-6 text-center" style={{ color: "var(--color-text-dim)" }}>{msg}</div>;
}
