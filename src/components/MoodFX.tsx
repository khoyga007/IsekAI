import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCampaign } from "@/state/campaign";

/**
 * MoodFX — full-screen, pointer-transparent overlays that make the screen
 * "breathe" with the scene mood. Sits on top of Backdrop's color blobs:
 *  - vignette: tinted edges per mood (combat red, eerie abyss, tragic ash…)
 *  - entry pulse: combat flares briefly when it begins
 *  - petals: romantic/tender scenes get slow-falling petals
 *  - grain: eerie/mystery add film grain
 * Pure CSS/framer — no assets, no canvas.
 */

const VIGNETTE: Record<string, { color: string; opacity: number }> = {
  combat:      { color: "#ff3864", opacity: 0.20 },
  tense:       { color: "#5b1d3d", opacity: 0.22 },
  eerie:       { color: "#0b1d33", opacity: 0.34 },
  mystery:     { color: "#3d1455", opacity: 0.20 },
  tragic:      { color: "#23232e", opacity: 0.30 },
  melancholic: { color: "#2c3850", opacity: 0.22 },
  romantic:    { color: "#ff9ec4", opacity: 0.10 },
  tender:      { color: "#f7c8d8", opacity: 0.08 },
  triumphant:  { color: "#ffb347", opacity: 0.12 },
  cozy:        { color: "#d9a36b", opacity: 0.10 },
  wistful:     { color: "#8b7fa8", opacity: 0.14 },
};

const PETAL_MOODS = new Set(["romantic", "tender"]);
const GRAIN_MOODS = new Set(["eerie", "mystery"]);

export function MoodFX() {
  const mood = useCampaign((s) => {
    const scenes = s.current?.scenes;
    return scenes && scenes.length > 0 ? scenes[scenes.length - 1].mood : undefined;
  });
  const norm = (mood ?? "").toLowerCase().trim();
  const vig = VIGNETTE[norm];

  // One-shot flare when combat begins (not on every render during combat).
  const [flare, setFlare] = useState(0);
  useEffect(() => {
    if (norm === "combat") setFlare(Date.now());
  }, [norm]);

  return (
    <div className="fixed inset-0 pointer-events-none z-20">
      {/* Mood vignette */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: vig ? 1 : 0 }}
        transition={{ duration: 1.6 }}
        style={{
          background: vig
            ? `radial-gradient(ellipse at center, transparent 52%, ${vig.color}${Math.round(vig.opacity * 255).toString(16).padStart(2, "0")} 100%)`
            : "transparent",
        }}
      />
      {/* Combat entry flare */}
      <AnimatePresence>
        {flare > 0 && norm === "combat" && (
          <motion.div
            key={flare}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.28, 0] }}
            transition={{ duration: 0.9, times: [0, 0.25, 1] }}
            style={{ background: "radial-gradient(ellipse at center, transparent 30%, #ff3864 100%)" }}
          />
        )}
      </AnimatePresence>
      {/* Film grain for the uncanny moods */}
      {GRAIN_MOODS.has(norm) && (
        <motion.div
          className="absolute inset-0 bg-grain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 2 }}
        />
      )}
      {/* Falling petals */}
      <AnimatePresence>{PETAL_MOODS.has(norm) && <Petals key="petals" />}</AnimatePresence>
    </div>
  );
}

function Petals() {
  // Stable random layout per mount so petals don't teleport on re-render.
  const petals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 6 + Math.random() * 7,
        duration: 9 + Math.random() * 8,
        delay: Math.random() * 9,
        sway: 20 + Math.random() * 40,
      })),
    [],
  );
  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 1.5 } }}>
      {petals.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          initial={{ y: "-4vh", x: 0, rotate: 0 }}
          animate={{ y: "104vh", x: [0, p.sway, -p.sway * 0.5, p.sway * 0.8], rotate: 360 }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "linear" }}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.8,
            background: "color-mix(in oklab, #ff9ec4 80%, white)",
            borderRadius: "60% 0 60% 60%",
            opacity: 0.55,
          }}
        />
      ))}
    </motion.div>
  );
}
