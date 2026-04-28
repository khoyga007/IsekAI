import { motion } from "framer-motion";
import { useSettings } from "@/state/settings";
import { useCampaign } from "@/state/campaign";

/** Tint overlay color per scene mood. Blended on top of genre blobs. */
const MOOD_TINT: Record<string, string> = {
  tense:       "#5b1d3d",  // bruised wine
  combat:      "#ff3864",  // vermillion flare
  calm:        "#5dffc1",  // soft mint
  romantic:    "#ff9ec4",  // pink dusk
  mystery:     "#3d1455",  // deep violet
  tragic:      "#3d3d4a",  // ash blue
  triumphant:  "#ffb347",  // amber gold
  eerie:       "#1a3a5e",  // cold abyss
  tender:      "#f7c8d8",  // warm rose
  cozy:        "#d9a36b",  // hearth amber
  awkward:     "#c4b88d",  // pale mustard
  melancholic: "#4a5a78",  // rain blue
  mundane:     "#a8a89c",  // muted oat
  wistful:     "#8b7fa8",  // dusk lavender
};

/** Maps a (loose) genre keyword to three blob colors that tint the backdrop. */
function moodFor(genre: string): [string, string, string] {
  const g = (genre || "").toLowerCase();
  if (g.includes("horror") || g.includes("cosmic"))      return ["#5b1d3d", "#1a3a5e", "#3d1455"];
  if (g.includes("cyberpunk") || g.includes("noir"))     return ["#ff3864", "#2de2e6", "#b967ff"];
  if (g.includes("romance") || g.includes("school"))     return ["#ff9ec4", "#ffd1a8", "#a8e6cf"];
  if (g.includes("mystery") || g.includes("detective"))  return ["#3a3349", "#5dffc1", "#ffb347"];
  if (g.includes("fantasy") || g.includes("isekai") || g.includes("rpg")) return ["#ff3864", "#5dffc1", "#b967ff"];
  if (g.includes("post-apocalyptic") || g.includes("grim") || g.includes("dark")) return ["#7a3b1a", "#3d3d4a", "#5b1d3d"];
  if (g.includes("slice") || g.includes("comedy"))       return ["#5dffc1", "#ffd1a8", "#2de2e6"];
  if (g.includes("battle") || g.includes("shonen"))      return ["#ff3864", "#ffb347", "#2de2e6"];
  return ["#ff3864", "#2de2e6", "#b967ff"];
}

/**
 * Ambient backdrop. Three drifting blobs whose color is keyed to the active
 * campaign's genre — horror cools to indigo, romance warms to peach, etc.
 */
export function Backdrop() {
  const lowFx = useSettings((s) => s.ui.lowFx);
  const genre = useCampaign((s) => s.current?.bible.genre ?? "");
  const scenes = useCampaign((s) => s.current?.scenes);
  const lastMood = scenes && scenes.length > 0 ? scenes[scenes.length - 1].mood : undefined;
  const tint = lastMood ? MOOD_TINT[lastMood] : null;
  const [c1, c2, c3] = moodFor(genre);

  return (
    <div className="fixed inset-0 -z-10 bg-ink-wash bg-grain overflow-hidden">
      {!lowFx && (
        <>
          <motion.div
            key={`b1-${c1}`}
            className="drift-blob-1 absolute -top-40 -left-40 w-[60vw] h-[60vw] rounded-full"
            style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${c1} 35%, transparent), transparent)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ duration: 1.6 }}
          />
          <motion.div
            key={`b2-${c2}`}
            className="drift-blob-2 absolute top-1/3 -right-40 w-[55vw] h-[55vw] rounded-full"
            style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${c2} 28%, transparent), transparent)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 1.8, delay: 0.2 }}
          />
          <motion.div
            key={`b3-${c3}`}
            className="drift-blob-1 absolute -bottom-60 left-1/4 w-[50vw] h-[50vw] rounded-full"
            style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${c3} 22%, transparent), transparent)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            transition={{ duration: 2, delay: 0.4 }}
          />
        </>
      )}
      {/* Mood tint overlay — fades smoothly between scenes. */}
      <motion.div
        key={`tint-${tint ?? "none"}`}
        className="absolute inset-0 pointer-events-none mix-blend-soft-light"
        style={{
          background: tint
            ? `radial-gradient(ellipse at 50% 60%, color-mix(in oklab, ${tint} 55%, transparent), transparent 70%)`
            : "transparent",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: tint ? 0.85 : 0 }}
        transition={{ duration: 1.6 }}
      />
    </div>
  );
}
