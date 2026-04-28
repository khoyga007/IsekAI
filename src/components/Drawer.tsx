import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  width?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * A glassmorphic side drawer. Used by Library, Cast, and Memory views to
 * keep the surface area consistent and avoid 3 separate copies of the
 * backdrop+slide+header boilerplate.
 */
export function Drawer({ open, onClose, side = "left", width = 520, title, subtitle, children, footer }: Props) {
  const isLeft = side === "left";
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
            initial={{ x: isLeft ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: isLeft ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className={`fixed top-0 bottom-0 z-50 glass-hi flex flex-col ${isLeft ? "left-0" : "right-0"}`}
            style={{
              width: `min(${width}px, 95vw)`,
              [isLeft ? "borderRight" : "borderLeft"]: "1px solid var(--color-border)",
            } as any}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                {subtitle && <div className="text-[10px] tracking-[0.4em] uppercase" style={{ color: "var(--color-text-dim)" }}>{subtitle}</div>}
                <h2 className="font-display text-2xl mt-0.5">{title}</h2>
              </div>
              <button onClick={onClose} className="grid place-items-center w-9 h-9 rounded-lg glass hover:glass-hi transition">
                <X size={16} />
              </button>
            </div>
            <div className="brush-divider mx-6" style={{ color: "color-mix(in oklab, var(--color-vermillion) 30%, transparent)" }} />

            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {footer && (
              <div className="px-6 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
