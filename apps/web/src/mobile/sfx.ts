/**
 * The phone game's interface sounds (owner, 2026-11-10), synthesized with Web Audio: no files, no
 * rights, a few kilobytes. Three styles under test (1 Hangar, 2 Propulsor, 4 Visor of the sound
 * page) plus silence, switched from the «Menú» sheet and remembered in this browser.
 *
 * Every button tap plays `tap`; a screen's own sound (a change of screen, a confirm, a training's
 * result) replaces the tap of the same click. The audio context starts on the first tap, as iOS
 * asks; with the phone's silent switch on, iOS plays nothing.
 */
import { browserStore, readKey, writeKey } from "../game/storage";

export const SOUND_STYLES = ["hangar", "propulsor", "visor", "off"] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];
export type SoundCue = "tap" | "confirm" | "nav" | "success" | "boost" | "fail";

export const SOUND_KEY = "falconess.juego.sonido";

/** The stored style; Propulsor when none was chosen yet. */
export function readSoundStyle(): SoundStyle {
  const v = readKey(browserStore(), SOUND_KEY);
  return SOUND_STYLES.find((s) => s === v) ?? "propulsor";
}

/** The style after `style` in the switch's cycle. */
export function nextSoundStyle(style: SoundStyle): SoundStyle {
  const i = SOUND_STYLES.indexOf(style);
  return SOUND_STYLES[(i + 1) % SOUND_STYLES.length] ?? "propulsor";
}

let style: SoundStyle | undefined;
let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let pendingTap: ReturnType<typeof setTimeout> | undefined;

function currentStyle(): SoundStyle {
  style ??= readSoundStyle();
  return style;
}

export function getSoundStyle(): SoundStyle {
  return currentStyle();
}

export function setSoundStyle(next: SoundStyle): void {
  style = next;
  writeKey(browserStore(), SOUND_KEY, next);
}

type Ctor = typeof AudioContext;
export function audio(): AudioContext | undefined {
  if (!ctx) {
    const w = globalThis as typeof globalThis & { webkitAudioContext?: Ctor };
    const C: Ctor | undefined = globalThis.AudioContext ?? w.webkitAudioContext;
    if (!C) return undefined;
    try {
      ctx = new C();
    } catch {
      return undefined;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

function env(g: GainNode, t: number, a: number, d: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

type ToneOpts = {
  type?: OscillatorType;
  f: number;
  f2?: number;
  t?: number;
  a?: number;
  d?: number;
  v?: number;
  lp?: number;
};
function tone(c: AudioContext, o: ToneOpts) {
  const { type = "sine", f, f2, t = 0, a = 0.005, d = 0.12, v = 0.4, lp } = o;
  const now = c.currentTime + t;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, now);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  let node: AudioNode = osc;
  if (lp) {
    const fl = c.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = lp;
    node.connect(fl);
    node = fl;
  }
  node.connect(g);
  if (master) g.connect(master);
  env(g, now, a, d, v);
  osc.start(now);
  osc.stop(now + a + d + 0.05);
}

type NoiseOpts = {
  type?: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  t?: number;
  a?: number;
  d?: number;
  v?: number;
};
let noiseBuf: AudioBuffer | undefined;
function noise(c: AudioContext, o: NoiseOpts) {
  const { type = "bandpass", f, f2, q = 1, t = 0, a = 0.005, d = 0.2, v = 0.3 } = o;
  const now = c.currentTime + t;
  if (!noiseBuf) {
    // one second of white noise, made once; the sounds only read pieces of it
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  const g = c.createGain();
  src.connect(fl);
  fl.connect(g);
  if (master) g.connect(master);
  env(g, now, a, d, v);
  src.start(now, Math.random() * 0.5);
  src.stop(now + a + d + 0.05);
}

function chord(c: AudioContext, root: number, o: Omit<ToneOpts, "f">) {
  for (const m of [1, 1.5, 2]) tone(c, { ...o, f: root * m });
}

type Bank = Record<SoundCue, (c: AudioContext) => void>;

/** The sounds of each style, as on the sound page (claude.ai artifact «Sonidos de Falconess»). */
const BANKS: Record<Exclude<SoundStyle, "off">, Bank> = {
  hangar: {
    tap: (c) => {
      noise(c, { f: 3800, q: 8, d: 0.03, v: 0.35 });
      tone(c, { type: "square", f: 1800, d: 0.02, v: 0.06 });
    },
    confirm: (c) => {
      noise(c, { f: 2600, q: 10, d: 0.04, v: 0.35 });
      noise(c, { t: 0.06, f: 900, q: 6, d: 0.08, v: 0.4 });
      tone(c, { type: "triangle", f: 220, t: 0.06, d: 0.1, v: 0.25 });
    },
    nav: (c) => {
      tone(c, { type: "sawtooth", f: 140, f2: 280, d: 0.18, v: 0.12, lp: 900 });
      noise(c, { t: 0.16, f: 3000, q: 8, d: 0.03, v: 0.3 });
    },
    success: (c) => {
      tone(c, { type: "sawtooth", f: 120, f2: 360, d: 0.35, v: 0.12, lp: 1200 });
      noise(c, { t: 0.36, f: 1100, q: 5, d: 0.1, v: 0.45 });
      chord(c, 330, { type: "triangle", t: 0.38, d: 0.45, v: 0.12 });
    },
    boost: (c) => {
      for (let i = 0; i < 6; i++)
        noise(c, { t: i * 0.07, f: 2000 + i * 400, q: 9, d: 0.03, v: 0.28 });
      tone(c, { type: "sawtooth", f: 110, f2: 440, d: 0.45, v: 0.12, lp: 1500 });
      noise(c, { t: 0.48, f: 1000, q: 4, d: 0.12, v: 0.5 });
      chord(c, 392, { type: "triangle", t: 0.5, d: 0.6, v: 0.14 });
      chord(c, 523, { type: "triangle", t: 0.62, d: 0.5, v: 0.1 });
    },
    fail: (c) => {
      tone(c, { type: "sawtooth", f: 220, f2: 70, d: 0.35, v: 0.15, lp: 700 });
      noise(c, { t: 0.05, f: 500, q: 3, d: 0.15, v: 0.3 });
    },
  },
  propulsor: {
    tap: (c) => noise(c, { type: "highpass", f: 4000, d: 0.04, v: 0.25 }),
    confirm: (c) => {
      noise(c, { f: 600, f2: 2400, q: 1.2, d: 0.14, v: 0.35 });
      tone(c, { f: 660, t: 0.08, d: 0.08, v: 0.1 });
    },
    nav: (c) => noise(c, { f: 400, f2: 3000, q: 0.8, d: 0.22, v: 0.3 }),
    success: (c) => {
      noise(c, { type: "lowpass", f: 300, f2: 2600, d: 0.45, v: 0.35 });
      tone(c, { f: 220, f2: 660, d: 0.45, v: 0.15 });
      tone(c, { f: 880, t: 0.45, d: 0.25, v: 0.15 });
    },
    boost: (c) => {
      noise(c, { type: "lowpass", f: 150, f2: 3200, d: 0.7, v: 0.4 });
      tone(c, { type: "sawtooth", f: 90, f2: 600, d: 0.7, v: 0.08, lp: 1800 });
      tone(c, { f: 784, t: 0.72, d: 0.3, v: 0.15 });
      tone(c, { f: 1046, t: 0.82, d: 0.35, v: 0.13 });
      noise(c, { type: "highpass", t: 0.72, f: 5000, d: 0.3, v: 0.15 });
    },
    fail: (c) => {
      for (let i = 0; i < 3; i++)
        noise(c, { type: "lowpass", t: i * 0.09, f: 700, d: 0.06, v: 0.35 });
      tone(c, { f: 300, f2: 120, t: 0.25, d: 0.2, v: 0.1 });
    },
  },
  visor: {
    tap: (c) => tone(c, { type: "square", f: 2093, d: 0.025, v: 0.08, lp: 5000 }),
    confirm: (c) => {
      tone(c, { type: "square", f: 1568, d: 0.04, v: 0.08, lp: 5000 });
      tone(c, { type: "square", f: 2093, t: 0.05, d: 0.06, v: 0.08, lp: 5000 });
    },
    nav: (c) => tone(c, { f: 600, f2: 1800, d: 0.12, v: 0.12 }),
    success: (c) => {
      [1046, 1318, 1568, 2093].forEach((f, i) => {
        tone(c, { type: "square", f, t: i * 0.06, d: 0.07, v: 0.07, lp: 5000 });
      });
      tone(c, { f: 2093, t: 0.26, d: 0.3, v: 0.08 });
    },
    boost: (c) => {
      for (let i = 0; i < 8; i++)
        tone(c, { type: "square", f: 700 + i * 160, t: i * 0.05, d: 0.03, v: 0.06, lp: 5000 });
      tone(c, { f: 400, f2: 2400, d: 0.4, v: 0.1 });
      [1318, 1568, 2093, 2637].forEach((f, i) => {
        tone(c, { type: "square", f, t: 0.45 + i * 0.05, d: 0.2, v: 0.06, lp: 6000 });
      });
    },
    fail: (c) => {
      tone(c, { type: "square", f: 330, d: 0.12, v: 0.08, lp: 3000 });
      tone(c, { type: "square", f: 247, t: 0.14, d: 0.2, v: 0.08, lp: 3000 });
    },
  },
};

let played = 0;
/** When the last confirm or training result played (ms, `performance.now`). */
let lastCueAt = Number.NEGATIVE_INFINITY;

/** Play a cue in the chosen style; it replaces a tap still waiting from the same click. */
export function playSound(cue: SoundCue): void {
  if (pendingTap !== undefined) {
    clearTimeout(pendingTap);
    pendingTap = undefined;
  }
  const s = currentStyle();
  if (s === "off") return;
  // the e2e tests cannot hear: the page names the last cue (a count and the cue, «3:nav»)
  played += 1;
  if (cue !== "tap" && cue !== "nav") lastCueAt = performance.now();
  globalThis.document?.documentElement.setAttribute("data-sfx", `${played}:${cue}`);
  const c = audio();
  if (!c) return;
  try {
    BANKS[s][cue](c);
  } catch {
    // a browser without some node type: the game goes on without that sound
  }
}

/**
 * A button was tapped: wake the audio now (iOS wants it inside the gesture) and play the tap
 * unless the click's own handler plays another cue first.
 */
export function queueTap(): void {
  if (currentStyle() === "off") return;
  audio();
  if (pendingTap !== undefined) clearTimeout(pendingTap);
  pendingTap = setTimeout(() => {
    pendingTap = undefined;
    playSound("tap");
  }, 0);
}

/** The change of screen; skipped when the click already played its own cue (a training's result). */
export function playNav(): void {
  if (performance.now() - lastCueAt < 200) return;
  playSound("nav");
}

/**
 * The stat «ping» of a training's result (owner 2026-11-11): bright bell pings climbing a major
 * arpeggio, one per stat that went up (and the skill points), so three gains sound «ping,
 * piiing, ping!» going up. `step` is its place (0 first), `of` how many there are; the one in
 * the middle of three rings longer. Same in every sound style; silent when sound is off.
 */
export function playPing(step: number, of: number): void {
  if (currentStyle() === "off") return;
  const c = audio();
  if (!c) return;
  // E5, A5, C#6, E6, A6: a major arpeggio that keeps climbing
  const notes = [659.25, 880, 1108.73, 1318.51, 1760];
  const f = notes[Math.min(step, notes.length - 1)] ?? 880;
  const long = of === 3 && step === 1;
  const d = long ? 0.55 : 0.32;
  try {
    tone(c, { type: "sine", f, d, v: 0.22, a: 0.004 });
    tone(c, { type: "triangle", f: f * 2, d: d * 0.6, v: 0.05, a: 0.004 });
    // a soft shimmer on top, like a bell
    tone(c, { type: "sine", f: f * 3.01, d: d * 0.35, v: 0.025, a: 0.004 });
  } catch {
    // no sound: the numbers still show
  }
}
