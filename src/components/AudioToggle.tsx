import { useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { useSettings } from "@/state/settings";
import { useCampaign } from "@/state/campaign";
import { ambient } from "@/audio/ambient";

/**
 * Bridges the campaign's genre and the user's mute/volume preference into
 * the global AmbientPlayer. Renders as a small toggle button for the top bar.
 */
export function AudioToggle() {
  const audio = useSettings((s) => s.ui.audio);
  const volume = useSettings((s) => s.ui.audioVolume);
  const setAudio = useSettings((s) => s.setAudio);
  const genre = useCampaign((s) => s.current?.bible.genre ?? null);
  const scenes = useCampaign((s) => s.current?.scenes);
  const lastMood = scenes && scenes.length > 0 ? (scenes[scenes.length - 1].mood ?? null) : null;

  useEffect(() => { ambient.setMuted(!audio); }, [audio]);
  useEffect(() => { ambient.setVolume(volume); }, [volume]);
  useEffect(() => { ambient.setGenre(audio ? genre : null); }, [genre, audio]);
  useEffect(() => { ambient.setMood(audio ? lastMood : null); }, [lastMood, audio]);

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={() => setAudio(!audio)}
      className="grid place-items-center w-9 h-9 rounded-full glass hover:glass-hi transition relative"
      title={audio ? "Mute ambient audio" : "Enable ambient audio"}
    >
      {audio ? <Volume2 size={14} /> : <VolumeX size={14} />}
      {audio && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
          style={{ background: "var(--color-jade)", boxShadow: "0 0 6px var(--color-jade)" }}
        />
      )}
    </motion.button>
  );
}
