/**
 * Avatar — single source of truth for character visuals across the app.
 *
 * If a `url` is provided, renders an <img>. Otherwise falls back to a
 * procedural gradient + initials sigil that's stable for a given name.
 * Callers (StoryView, CastView, WorldEditView) don't need to know which
 * mode they're in.
 */
import { useState } from "react";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function avatarFor(name: string) {
  const h = hash(name || "?");
  const hue1 = h % 360;
  const hue2 = (h * 7) % 360;
  const angle = (h % 12) * 30;
  const pattern = h % 3;

  const c1 = `hsl(${hue1} 75% 58%)`;
  const c2 = `hsl(${hue2} 75% 38%)`;
  const c3 = `hsl(${(hue1 + 180) % 360} 70% 50%)`;

  let bg: string;
  if (pattern === 0) {
    bg = `radial-gradient(at 30% 30%, ${c1}, ${c2} 70%)`;
  } else if (pattern === 1) {
    bg = `conic-gradient(from ${angle}deg, ${c1}, ${c3}, ${c2}, ${c1})`;
  } else {
    bg = `linear-gradient(${angle}deg, ${c1}, ${c2}), radial-gradient(at 70% 70%, ${c3}, transparent 50%)`;
  }
  return { bg, hue1, hue2, initials: initials(name) };
}

export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  /** Image URL. If absent or fails to load, falls back to procedural sigil. */
  url?: string;
  /** Square size in px. */
  size?: number;
  /** Override font size for the initials fallback. */
  fontSize?: number;
  /** Extra ring/glow shadow override. */
  ringShadow?: string;
  /** Optional click handler (used in pickers). */
  onClick?: () => void;
  /** Render with a hard border ring (used in pickers to mark selection). */
  selected?: boolean;
}

export function Avatar({
  name,
  url,
  size = 32,
  fontSize,
  ringShadow,
  onClick,
  selected,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const a = avatarFor(name);
  const showImg = !!url && !imgFailed;

  const baseShadow =
    ringShadow ?? `0 0 0 1px color-mix(in oklab, var(--color-paper) 12%, transparent), 0 0 16px -4px hsl(${a.hue1} 80% 50%)`;
  const selectedShadow = "0 0 0 2px var(--color-vermillion), 0 0 22px -2px var(--color-vermillion)";

  const shared = {
    width: size,
    height: size,
    boxShadow: selected ? selectedShadow : baseShadow,
    borderRadius: "9999px",
    flexShrink: 0,
    cursor: onClick ? "pointer" : undefined,
    overflow: "hidden",
  } as React.CSSProperties;

  if (showImg) {
    return (
      <div style={shared} onClick={onClick} className="select-none">
        <img
          src={url}
          alt={name}
          referrerPolicy="no-referrer"
          onError={(e) => {
            console.warn("[Avatar] image failed to load:", url, e);
            setImgFailed(true);
          }}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="grid place-items-center font-display select-none"
      style={{
        ...shared,
        background: a.bg,
        color: "rgba(255,255,255,0.92)",
        fontSize: fontSize ?? Math.max(10, Math.round(size * 0.34)),
      }}
    >
      {a.initials}
    </div>
  );
}
