/**
 * Procedural ambient audio per genre — no asset files.
 *
 * For each genre we spin up a small graph of oscillators routed through
 * filters + a master gain. The oscillator frequencies, waveforms, and
 * detune wobble give each "preset" a distinct character (warm pad for
 * romance, cold drone for horror, arpeggio for cyberpunk, etc).
 *
 * Why synth instead of MP3 loops?
 *  - zero shipped audio assets
 *  - no copyright concerns
 *  - infinitely loopable without seam
 *  - tiny memory footprint
 */

type Voice = { osc: OscillatorNode; gain: GainNode; lfo?: OscillatorNode; lfoGain?: GainNode };

interface Preset {
  /** Filter cutoff (Hz). Lower = darker. */
  filter: number;
  /** Master volume on top of user setting. */
  volume: number;
  /** [freqHz, type, detuneCents, lfoHz?] */
  voices: [number, OscillatorType, number, number?][];
  /** Chord progression as semitone shifts of the whole pad. The pad glides
   *  to the next step every ~10s — this is what stops the preset from being
   *  a static drone. */
  progression: number[];
  /** Melody scale (semitones from melodyRoot) for sparse generative plucks. */
  scale: number[];
  /** Root frequency for melody notes. */
  melodyRoot: number;
}

// Common scales (semitones).
const PENTA_MAJOR = [0, 2, 4, 7, 9];
const PENTA_MINOR = [0, 3, 5, 7, 10];
const PHRYGIAN_DARK = [0, 1, 3, 7, 8];   // eerie semitone colour
const WHOLE_TONE = [0, 2, 4, 6, 8, 10];  // unmoored, dreamlike

const PRESETS: Record<string, Preset> = {
  // Warm dual-pad fifth — soft, hopeful. I–vi–IV–V motion.
  default: { filter: 1200, volume: 1, voices: [
    [110, "sine",     -7, 0.12],
    [165, "triangle", +5, 0.18],
    [220, "sine",     +12, 0.08],
  ], progression: [0, -3, 5, 7], scale: PENTA_MAJOR, melodyRoot: 440 },
  // Wide vermillion+cyan major-7th — adventure. Heroic IV/V lifts.
  fantasy: { filter: 1400, volume: 0.95, voices: [
    [110, "sawtooth", -9, 0.1],
    [138.6, "sine",   +6, 0.15],
    [164.8, "triangle", -3, 0.2],
    [277.2, "sine",   +14, 0.08],
  ], progression: [0, 5, -3, 7, 0, -5], scale: PENTA_MAJOR, melodyRoot: 440 },
  // Cold detuned dissonance — dread. Half-step creep, never resolves.
  horror: { filter: 600, volume: 0.85, voices: [
    [55, "sawtooth",   -22, 0.05],
    [82.4, "sawtooth", +18, 0.07],
    [98, "square",     -11, 0.04],
    [131, "sine",      +33, 0.03],
  ], progression: [0, 1, -1, 6], scale: PHRYGIAN_DARK, melodyRoot: 220 },
  // Arpeggiated synth-bass — neon city. Minor club loop.
  cyberpunk: { filter: 1800, volume: 0.9, voices: [
    [82.4, "sawtooth", -7, 0.25],
    [123.5, "square",  +6, 0.4],
    [185, "triangle",  -4, 0.6],
    [330, "sine",      +12, 0.15],
  ], progression: [0, -2, 3, -2], scale: PENTA_MINOR, melodyRoot: 330 },
  // Soft pink-air — slow piano-like room. Gentle ii–V drift.
  romance: { filter: 2200, volume: 0.8, voices: [
    [196, "sine",     -4, 0.22],
    [261.6, "sine",   +3, 0.18],
    [329.6, "triangle", -2, 0.15],
    [392, "sine",     +5, 0.1],
  ], progression: [0, 2, -3, 5], scale: PENTA_MAJOR, melodyRoot: 523.3 },
  // Wet rain-tone, low pulses — mystery. Whole-tone ambiguity.
  mystery: { filter: 900, volume: 0.85, voices: [
    [73.4, "sine",     -8, 0.07],
    [110, "triangle",  +6, 0.1],
    [146.8, "sawtooth", -12, 0.05],
  ], progression: [0, 4, -2, 6], scale: WHOLE_TONE, melodyRoot: 293.7 },
  // Bright pop pad — slice-of-life. Cheerful axis progression.
  slice: { filter: 2400, volume: 0.85, voices: [
    [220, "sine",     -3, 0.2],
    [277.2, "triangle", +4, 0.3],
    [329.6, "sine",   -1, 0.25],
  ], progression: [0, -3, 5, 7], scale: PENTA_MAJOR, melodyRoot: 523.3 },
  // Gritty tritone — post-apocalyptic. Slow doom plod.
  apoc: { filter: 700, volume: 0.85, voices: [
    [73.4, "sawtooth", -14, 0.05],
    [104, "square",    +9, 0.06],
    [155.6, "sine",    -7, 0.08],
  ], progression: [0, -2, 1, -5], scale: PENTA_MINOR, melodyRoot: 220 },
};

function presetFor(genre: string): Preset {
  const g = (genre || "").toLowerCase();
  if (g.includes("horror") || g.includes("cosmic"))         return PRESETS.horror;
  if (g.includes("cyberpunk") || g.includes("noir"))        return PRESETS.cyberpunk;
  if (g.includes("romance") || g.includes("school"))        return PRESETS.romance;
  if (g.includes("mystery") || g.includes("detective"))     return PRESETS.mystery;
  if (g.includes("post-apoc") || g.includes("grim") || g.includes("dark")) return PRESETS.apoc;
  if (g.includes("slice") || g.includes("comedy"))          return PRESETS.slice;
  if (g.includes("fantasy") || g.includes("isekai") || g.includes("rpg") || g.includes("shonen") || g.includes("battle"))
                                                            return PRESETS.fantasy;
  return PRESETS.default;
}

/**
 * Per-mood modifier applied on top of the genre preset.
 * filterMul nudges the lowpass cutoff (warmer/darker), gainMul lifts/dips
 * master volume, detune shifts pitch a few cents.
 */
const MOOD_MODS: Record<string, { filterMul: number; gainMul: number; detune: number; melodyMul: number }> = {
  // melodyMul scales the pause between generative melody notes:
  // <1 = busier (combat, triumphant), >1 = sparser (tragic, eerie).
  tense:       { filterMul: 0.75, gainMul: 1.0,  detune: -8,  melodyMul: 1.4 },
  combat:      { filterMul: 1.4,  gainMul: 1.15, detune: +12, melodyMul: 0.6 },
  calm:        { filterMul: 1.2,  gainMul: 0.85, detune: 0,   melodyMul: 1.2 },
  romantic:    { filterMul: 1.35, gainMul: 0.9,  detune: +4,  melodyMul: 0.9 },
  mystery:     { filterMul: 0.6,  gainMul: 0.9,  detune: -4,  melodyMul: 1.5 },
  tragic:      { filterMul: 0.55, gainMul: 0.8,  detune: -14, melodyMul: 1.8 },
  triumphant:  { filterMul: 1.5,  gainMul: 1.1,  detune: +7,  melodyMul: 0.7 },
  eerie:       { filterMul: 0.5,  gainMul: 0.75, detune: -22, melodyMul: 2.0 },
  tender:      { filterMul: 1.3,  gainMul: 0.82, detune: +3,  melodyMul: 1.0 },
  cozy:        { filterMul: 1.15, gainMul: 0.78, detune: -2,  melodyMul: 1.1 },
  awkward:     { filterMul: 0.95, gainMul: 0.7,  detune: +6,  melodyMul: 1.3 },
  melancholic: { filterMul: 0.7,  gainMul: 0.78, detune: -10, melodyMul: 1.6 },
  mundane:     { filterMul: 1.0,  gainMul: 0.7,  detune: 0,   melodyMul: 1.4 },
  wistful:     { filterMul: 0.85, gainMul: 0.78, detune: -6,  melodyMul: 1.5 },
};

const SEMITONE = Math.pow(2, 1 / 12);
const st = (n: number) => Math.pow(SEMITONE, n);

class AmbientPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voices: Voice[] = [];
  private currentGenre: string | null = null;
  private currentMood: string | null = null;
  private baseFilter = 1200;
  private basePresetVolume = 1;
  private targetVolume = 0.18;
  private muted = true;
  // Generative movement state — chord progression + sparse melody. Without
  // these the pad holds one chord forever and reads as noise, not music.
  private preset: Preset | null = null;
  private baseFreqs: number[] = [];
  private progIdx = 0;
  private progTimer: ReturnType<typeof setInterval> | null = null;
  private melodyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMelodyDegree = -1;

  /** Lazily create an AudioContext (must follow a user gesture in browsers). */
  private ensureCtx() {
    if (this.ctx) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.targetVolume;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1200;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number) {
    this.targetVolume = Math.max(0, Math.min(0.6, v));
    if (!this.master || !this.ctx) return;
    if (!this.muted) this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    if (!this.muted) this.master.gain.linearRampToValueAtTime(this.targetVolume, this.ctx.currentTime + 0.4);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.master || !this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(m ? 0 : this.targetVolume, this.ctx.currentTime + 0.6);
  }

  setGenre(genre: string | null) {
    if (genre === this.currentGenre) return;
    this.currentGenre = genre;
    this.ensureCtx();
    if (!this.ctx || !this.filter) return;
    this.tearDownVoices();
    if (!genre) return;

    const preset = presetFor(genre);
    this.baseFilter = preset.filter;
    this.basePresetVolume = preset.volume;
    const mod = this.currentMood ? MOOD_MODS[this.currentMood] : null;
    const targetCutoff = preset.filter * (mod?.filterMul ?? 1);
    this.filter.frequency.linearRampToValueAtTime(targetCutoff, this.ctx.currentTime + 1.2);

    for (const [freq, type, detune, lfoHz] of preset.voices) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune + (mod?.detune ?? 0);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.18 * preset.volume * (mod?.gainMul ?? 1) / preset.voices.length, this.ctx.currentTime + 1.5);
      osc.connect(g).connect(this.filter);
      osc.start();

      const v: Voice = { osc, gain: g };

      if (lfoHz) {
        // LFO modulates the gain for slow swells.
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = lfoHz;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.06 * preset.volume / preset.voices.length;
        lfo.connect(lfoGain).connect(g.gain);
        lfo.start();
        v.lfo = lfo;
        v.lfoGain = lfoGain;
      }

      this.voices.push(v);
    }

    this.preset = preset;
    this.baseFreqs = preset.voices.map(([f]) => f);
    this.startSchedulers();
  }

  private tearDownVoices() {
    this.stopSchedulers();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.linearRampToValueAtTime(0, t + 0.8);
      v.osc.stop(t + 0.9);
      v.lfo?.stop(t + 0.9);
    }
    this.voices = [];
    this.preset = null;
    this.baseFreqs = [];
    this.progIdx = 0;
  }

  /* ---------- Generative movement ---------- */

  private startSchedulers() {
    this.stopSchedulers();
    // Glide the whole pad to the next chord step every ~10s. The 2.5s ramp
    // keeps it pad-like — a slow harmonic drift, not a key change jolt.
    this.progTimer = setInterval(() => this.nextChord(), 10000);
    this.scheduleMelody();
  }

  private stopSchedulers() {
    if (this.progTimer) { clearInterval(this.progTimer); this.progTimer = null; }
    if (this.melodyTimer) { clearTimeout(this.melodyTimer); this.melodyTimer = null; }
  }

  private chordShift(): number {
    const prog = this.preset?.progression ?? [0];
    return prog[this.progIdx % prog.length];
  }

  private nextChord() {
    if (!this.ctx || !this.preset || this.voices.length === 0) return;
    this.progIdx++;
    const ratio = st(this.chordShift());
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const base = this.baseFreqs[i];
      if (!base) return;
      v.osc.frequency.cancelScheduledValues(t);
      v.osc.frequency.linearRampToValueAtTime(base * ratio, t + 2.5);
    });
  }

  /** One soft melodic note from the preset scale, in key with the current
   *  chord. Long decay, routed through the genre filter so it sits inside
   *  the pad instead of on top of it. */
  private playMelodyNote() {
    if (this.muted || !this.ctx || !this.filter || !this.preset) return;
    const scale = this.preset.scale;
    // Avoid repeating the previous degree — two identical notes in a row
    // reads as a stuck record at this density.
    let deg = Math.floor(Math.random() * scale.length);
    if (scale.length > 1 && deg === this.lastMelodyDegree) deg = (deg + 1) % scale.length;
    this.lastMelodyDegree = deg;
    const octave = Math.random() < 0.3 ? 12 : 0;
    const freq = this.preset.melodyRoot * st(this.chordShift() + scale[deg] + octave);

    const t = this.ctx.currentTime;
    const dur = 0.9 + Math.random() * 0.8;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.targetVolume * 0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.filter);
    o.start(t);
    o.stop(t + dur + 0.1);
    // Quiet echo a fifth below, slightly delayed — cheap sense of space.
    if (Math.random() < 0.4) {
      const e = this.ctx.createOscillator();
      e.type = "sine";
      e.frequency.value = freq * st(-5);
      const eg = this.ctx.createGain();
      eg.gain.setValueAtTime(0, t + 0.22);
      eg.gain.linearRampToValueAtTime(this.targetVolume * 0.18, t + 0.26);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 + dur);
      e.connect(eg).connect(this.filter);
      e.start(t + 0.22);
      e.stop(t + 0.32 + dur);
    }
  }

  private scheduleMelody() {
    const mod = this.currentMood ? MOOD_MODS[this.currentMood] : null;
    const base = 2500 + Math.random() * 3500;          // 2.5-6s between notes
    const wait = base * (mod?.melodyMul ?? 1);
    this.melodyTimer = setTimeout(() => {
      this.playMelodyNote();
      this.scheduleMelody();
    }, wait);
  }

  /**
   * Smoothly retune the active genre preset toward a mood.
   * Adjusts only filter cutoff, voice gain, and detune — not the chord shape.
   * Pass null to clear back to neutral.
   */
  setMood(mood: string | null) {
    const norm = mood ? mood.toLowerCase().trim() : null;
    if (norm === this.currentMood) return;
    this.currentMood = norm;
    if (!this.ctx || !this.filter || !this.voices.length) return;

    const t = this.ctx.currentTime;
    const mod = norm ? MOOD_MODS[norm] : null;
    const targetCutoff = this.baseFilter * (mod?.filterMul ?? 1);
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.linearRampToValueAtTime(targetCutoff, t + 1.4);

    const perVoiceGain = 0.18 * this.basePresetVolume * (mod?.gainMul ?? 1) / this.voices.length;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.linearRampToValueAtTime(perVoiceGain, t + 1.4);
      v.osc.detune.cancelScheduledValues(t);
      // Preserve preset detune by reading current value, then nudging.
      const cur = v.osc.detune.value;
      v.osc.detune.linearRampToValueAtTime(cur + (mod?.detune ?? 0) - (this.lastMoodDetune ?? 0), t + 1.4);
    }
    this.lastMoodDetune = mod?.detune ?? 0;
  }
  private lastMoodDetune: number = 0;

  /* ---------- Character leitmotifs ---------- */

  private lastMotifSpeaker: string | null = null;
  private lastMotifAt = 0;

  /**
   * Play a short 3-note motif unique to a character — same name, same tune,
   * every campaign. Notes come from the active genre scale (in key with the
   * current chord), degrees from the name hash. Throttled: only when the
   * speaker changes, at most once per 8s, so back-and-forth dialogue doesn't
   * turn into a music box.
   */
  motif(name: string) {
    if (this.muted || !this.ctx || !this.filter || !this.preset) return;
    const now = Date.now();
    if (name === this.lastMotifSpeaker || now - this.lastMotifAt < 8000) {
      this.lastMotifSpeaker = name;
      return;
    }
    this.lastMotifSpeaker = name;
    this.lastMotifAt = now;

    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;

    const scale = this.preset.scale;
    const root = this.preset.melodyRoot;
    const shift = this.chordShift();
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const deg = (hash >> (i * 5)) % scale.length;
      const octave = ((hash >> (i * 3 + 11)) & 1) === 1 && i === 2 ? 12 : 0;
      const freq = root * st(shift + scale[deg] + octave);
      const t = t0 + i * 0.16;
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(this.targetVolume * 0.4, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(this.filter);
      o.start(t);
      o.stop(t + 0.6);
    }
  }

  /** Pluck — short triangle hit for UI cues (panel reveal, dice roll). */
  pluck(freq = 660, durationMs = 90, type: OscillatorType = "triangle") {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(this.targetVolume * 0.6, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + durationMs / 1000 + 0.05);
  }
}

export const ambient = new AmbientPlayer();
