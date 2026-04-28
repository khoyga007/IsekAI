import { useEffect, useRef, useState } from "react";
import { ambient } from "@/audio/ambient";

/**
 * Reveals `target` character-by-character at ~`charsPerSec` (default 90).
 * - When `enabled` is false, instantly returns the full target.
 * - When `skip` flips true, jumps to the full target.
 * - If `target` grows mid-stream (the AI is still emitting), the cursor
 *   keeps advancing from where it was — no flicker, no restart.
 * - Plays a soft pluck every ~5 chars when ambient audio is unmuted.
 */
export function useTypewriter(
  target: string,
  enabled: boolean,
  skip: boolean,
  charsPerSec = 90,
): string {
  const [shown, setShown] = useState(enabled ? "" : target);
  const idxRef = useRef(0);
  const lastClickAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || skip) {
      idxRef.current = target.length;
      setShown(target);
      return;
    }
    // If target shrank (rare — restart), clamp.
    if (idxRef.current > target.length) idxRef.current = 0;
    if (idxRef.current >= target.length) {
      setShown(target);
      return;
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      const advance = Math.floor((dt / 1000) * charsPerSec);
      if (advance > 0) {
        last = now;
        const prev = idxRef.current;
        idxRef.current = Math.min(target.length, prev + advance);
        setShown(target.slice(0, idxRef.current));
        // Soft tick every ~5 chars, throttled to 80ms.
        if (idxRef.current - lastClickAtRef.current >= 5 && now - last > -1) {
          lastClickAtRef.current = idxRef.current;
          // 1100-1400Hz, very short — barely audible per-char, more felt as texture.
          ambient.pluck(1100 + (idxRef.current % 300), 18, "triangle");
        }
      }
      if (idxRef.current < target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, skip, charsPerSec]);

  return shown;
}
