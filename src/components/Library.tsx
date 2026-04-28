import { motion } from "framer-motion";
import { Trash2, Play, FileDown, Plus } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { avatarFor } from "@/lib/avatar";
import { exportCampaign } from "@/lib/export";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
}

export function Library({ open, onClose, onNew }: Props) {
  const t = useT();
  const library = useCampaign((s) => s.library);
  const current = useCampaign((s) => s.current);
  const load = useCampaign((s) => s.load);
  const remove = useCampaign((s) => s.remove);

  const items = Object.values(library).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("lib.title")}
      subtitle={t("lib.subtitle")}
      footer={
        <button
          onClick={() => { onClose(); onNew(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full edge-neon text-sm"
          style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)" }}
        >
          <Plus size={14} /> {t("lib.new")}
        </button>
      }
    >
      {items.length === 0 ? (
        <div className="text-sm py-8 text-center" style={{ color: "var(--color-text-dim)" }}>
          {t("lib.empty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const a = avatarFor(it.title);
            const isActive = current?.id === it.id;
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl p-3 flex items-center gap-3"
                style={{ boxShadow: isActive ? "inset 0 0 0 1px var(--color-vermillion)" : undefined }}
              >
                <div
                  className="w-12 h-12 rounded-lg grid place-items-center font-display text-sm flex-shrink-0"
                  style={{ background: a.bg, color: "rgba(255,255,255,0.95)" }}
                >
                  {a.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm truncate" style={{ color: "var(--color-paper)" }}>{it.title}</div>
                  <div className="flex items-center gap-2 text-[11px] mt-0.5" style={{ color: "var(--color-text-dim)" }}>
                    <span>{it.genre}</span>
                    <span>·</span>
                    <span>{it.protagonist}</span>
                    <span>·</span>
                    <span className="font-mono">T{it.turns}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn
                    title={isActive ? t("lib.btn.active") : t("lib.btn.load")}
                    onClick={() => { void load(it.id); onClose(); }}
                    disabled={isActive}
                  >
                    <Play size={13} />
                  </IconBtn>
                  <IconBtn title={t("lib.btn.export")} onClick={async () => {
                    const cur = useCampaign.getState().current;
                    if (cur?.id === it.id) {
                      await exportCampaign(cur);
                    } else {
                      await load(it.id);
                      const cc = useCampaign.getState().current;
                      if (cc) await exportCampaign(cc);
                    }
                  }}>
                    <FileDown size={13} />
                  </IconBtn>
                  <IconBtn title={t("lib.btn.delete")} onClick={() => { if (confirm(t("lib.confirm.delete", { title: it.title }))) void remove(it.id); }} danger>
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="grid place-items-center w-8 h-8 rounded-lg transition hover:glass disabled:opacity-30"
      style={{ color: danger ? "var(--color-vermillion)" : "var(--color-text-dim)" }}
    >
      {children}
    </button>
  );
}
