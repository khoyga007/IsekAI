import { useState } from "react";
import { motion } from "framer-motion";
import { Bookmark, RotateCcw, GitBranch, Trash2, Plus } from "lucide-react";
import { useCampaign } from "@/state/campaign";
import { Drawer } from "./Drawer";
import { useT } from "@/lib/i18n";

interface Props { open: boolean; onClose: () => void; }

/**
 * Save Points drawer — list of bookmarks for the active campaign.
 * Each save can be Restored (rewinds in place) or Branched (forks
 * into a brand-new campaign and switches to it).
 */
export function SavesView({ open, onClose }: Props) {
  const t = useT();
  const c = useCampaign((s) => s.current);
  const bookmark = useCampaign((s) => s.bookmark);
  const restoreBookmark = useCampaign((s) => s.restoreBookmark);
  const branchBookmark = useCampaign((s) => s.branchBookmark);
  const deleteBookmark = useCampaign((s) => s.deleteBookmark);

  const [label, setLabel] = useState("");

  const bookmarks = (c?.bookmarks ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);

  const onCreate = async () => {
    if (!c) return;
    await bookmark(label.trim());
    setLabel("");
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("saves.title")}
      subtitle={c?.bible.title ?? "—"}
      width={540}
      footer={
        c && (
          <div className="flex items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
              placeholder={t("saves.create.placeholder")}
              className="flex-1 bg-transparent px-3 py-2 rounded-lg outline-none text-sm"
              style={{
                background: "color-mix(in oklab, var(--color-ink-700) 60%, transparent)",
                border: "1px solid var(--color-border)",
                color: "var(--color-paper)",
              }}
            />
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full edge-neon text-xs"
              style={{ background: "color-mix(in oklab, var(--color-vermillion) 22%, transparent)" }}
            >
              <Plus size={12} /> {t("saves.btn.save")}
            </button>
          </div>
        )
      }
    >
      {!c ? (
        <Empty msg={t("saves.noCampaign")} />
      ) : bookmarks.length === 0 ? (
        <Empty msg={t("saves.empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {bookmarks.map((b) => (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl p-3 flex items-center gap-3"
            >
              <div
                className="grid place-items-center w-10 h-10 rounded-lg flex-shrink-0"
                style={{
                  background: "color-mix(in oklab, var(--color-amber) 15%, transparent)",
                  boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-amber) 50%, transparent)",
                }}
              >
                <Bookmark size={14} style={{ color: "var(--color-amber)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-sm truncate" style={{ color: "var(--color-paper)" }}>{b.label}</div>
                <div className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--color-text-dim)" }}>
                  {t("saves.atTurn")} T{b.turn} · {new Date(b.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn
                  title={t("saves.btn.restore")}
                  onClick={async () => {
                    if (!confirm(t("saves.confirm.restore"))) return;
                    await restoreBookmark(b.id);
                    onClose();
                  }}
                >
                  <RotateCcw size={13} />
                </IconBtn>
                <IconBtn
                  title={t("saves.btn.branch")}
                  onClick={async () => {
                    await branchBookmark(b.id);
                    onClose();
                  }}
                >
                  <GitBranch size={13} />
                </IconBtn>
                <IconBtn
                  title={t("saves.btn.delete")}
                  danger
                  onClick={async () => {
                    if (!confirm(t("saves.confirm.delete"))) return;
                    await deleteBookmark(b.id);
                  }}
                >
                  <Trash2 size={13} />
                </IconBtn>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid place-items-center w-8 h-8 rounded-lg transition hover:glass"
      style={{ color: danger ? "var(--color-vermillion)" : "var(--color-text-dim)" }}
    >
      {children}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm py-8 text-center max-w-sm mx-auto" style={{ color: "var(--color-text-dim)" }}>{msg}</div>;
}
