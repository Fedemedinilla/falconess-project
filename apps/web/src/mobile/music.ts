/**
 * The game's music (owner 2026-11-12, his own Suno tracks): «Title Theme» on the title and the
 * character select, «Menu Theme» through the season's screens, «Race» in the races.
 *
 * - The files are loudness-matched offline (−18 LUFS each, ffmpeg loudnorm), so the per-track
 *   levels below only set how present each one is: the menus sit under the interface sounds,
 *   the title and the race come forward.
 * - Every start fades in, every change crossfades (the old one fades out while the new one fades
 *   in) and a track loops by crossfading its end into its own start: nothing ever cuts.
 * - Played through `<audio>` elements routed into the sound's AudioContext (their volume is a
 *   GainNode: iOS ignores `audio.volume`), so a 3-minute track never sits decoded in memory.
 * - Browsers only start sound after a tap: the title screen's tap is that gesture, and any later
 *   tap resumes music the browser held back. Off in the «Menú» (kept in this browser), and
 *   paused while the page is hidden.
 */
import menuUrl from "./music/menu.mp3";
import raceUrl from "./music/race.mp3";
import titleUrl from "./music/title.mp3";
import { audio } from "./sfx";

export type Track = "title" | "menu" | "race";

const URLS: Readonly<Record<Track, string>> = { title: titleUrl, menu: menuUrl, race: raceUrl };
/** How loud each track plays (0-1) over its normalized file. */
const LEVEL: Readonly<Record<Track, number>> = { title: 0.7, menu: 0.45, race: 0.62 };

/** Seconds: a first start, a track leaving, a track arriving, the loop's own crossfade. */
const FADE_START = 2.5;
const FADE_OUT = 1.6;
const FADE_IN = 2.2;
const LOOP_XFADE = 4;

export const MUSIC_KEY = "falconess.juego.musica";

type Voice = { readonly el: HTMLAudioElement; readonly gain: GainNode };
type Playing = { readonly track: Track; voice: Voice; slot: 0 | 1 };

const voices = new Map<string, Voice>();
let playing: Playing | undefined;
let wanted: Track | undefined;
let musicOn = readMusicOn();
let timer: ReturnType<typeof setInterval> | undefined;

function readMusicOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUSIC_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Whether music is on (the «Menú» switch). */
export function getMusicOn(): boolean {
  return musicOn;
}

/** The «Menú» switch: off fades the music out, on brings the wanted track back in. */
export function setMusicOn(on: boolean): void {
  musicOn = on;
  try {
    globalThis.localStorage?.setItem(MUSIC_KEY, on ? "on" : "off");
  } catch {
    // no storage: the choice lasts this visit
  }
  if (on) start();
  else stopAll(FADE_OUT);
}

/** A data: URL (the single-file page inlines the tracks) as a Blob URL, which iOS streams better. */
function playableUrl(url: string): string {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m || typeof Blob === "undefined") return url;
  try {
    const bytes = Uint8Array.from(atob(m[2] ?? ""), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: m[1] ?? "audio/mpeg" }));
  } catch {
    return url;
  }
}

const sources = new Map<Track, string>();

function voice(track: Track, slot: 0 | 1): Voice | undefined {
  const key = `${track}/${slot}`;
  const hit = voices.get(key);
  if (hit) return hit;
  const ctx = audio();
  if (!ctx || typeof Audio === "undefined") return undefined;
  let src = sources.get(track);
  if (src === undefined) {
    src = playableUrl(URLS[track]);
    sources.set(track, src);
  }
  try {
    const el = new Audio(src);
    el.preload = "auto";
    el.loop = false;
    el.setAttribute("playsinline", "");
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(ctx.destination);
    const v = { el, gain };
    voices.set(key, v);
    return v;
  } catch {
    return undefined;
  }
}

/** Ramp a voice's gain to `to` over `seconds`, from where it is now. */
function ramp(v: Voice, to: number, seconds: number): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const g = v.gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(to, now + seconds);
}

function fadeOutAndPause(v: Voice, seconds: number): void {
  ramp(v, 0, seconds);
  setTimeout(
    () => {
      // paused only if nobody started it again meanwhile
      if (playing?.voice !== v) v.el.pause();
    },
    seconds * 1000 + 80,
  );
}

function begin(track: Track, slot: 0 | 1, fade: number): Playing | undefined {
  const v = voice(track, slot);
  if (!v) return undefined;
  v.gain.gain.value = 0;
  try {
    v.el.currentTime = 0;
  } catch {
    // not seekable yet: it starts from the top anyway
  }
  const p = v.el.play();
  // held back until a tap (autoplay rules): the next tap starts it again
  if (p)
    p.catch(() => {
      if (playing?.voice === v) playing = undefined;
    });
  ramp(v, LEVEL[track], fade);
  return { track, voice: v, slot };
}

function stopAll(seconds: number): void {
  if (playing) fadeOutAndPause(playing.voice, seconds);
  playing = undefined;
}

/** Start (or crossfade to) the wanted track. */
function start(): void {
  if (!musicOn || wanted === undefined) return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (playing?.track === wanted && !playing.voice.el.paused) return;
  const first = playing === undefined;
  if (playing) fadeOutAndPause(playing.voice, FADE_OUT);
  const slot: 0 | 1 = playing?.track === wanted && playing.slot === 0 ? 1 : 0;
  playing = begin(wanted, slot, first ? FADE_START : FADE_IN);
  watch();
  if (typeof document !== "undefined") document.documentElement.dataset.music = wanted;
}

/** Near a track's end, its other voice starts from the top while this one fades out. */
function watch(): void {
  if (timer !== undefined) return;
  timer = setInterval(() => {
    const p = playing;
    if (!p) return;
    const { el } = p.voice;
    if (!Number.isFinite(el.duration) || el.duration <= LOOP_XFADE * 2) return;
    if (el.currentTime < el.duration - LOOP_XFADE) return;
    fadeOutAndPause(p.voice, LOOP_XFADE);
    playing = begin(p.track, p.slot === 0 ? 1 : 0, LOOP_XFADE);
  }, 250);
}

/** The music a screen wants; it starts now if the browser allows, else at the next tap. */
export function setMusic(track: Track): void {
  wanted = track;
  start();
}

/** Call inside a tap: the gesture lets the browser start sound (the title's tap, any tap). */
export function unlockMusic(): void {
  audio();
  start();
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => {
    if (wanted !== undefined && musicOn && (playing === undefined || playing.voice.el.paused))
      unlockMusic();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (playing) {
        playing.voice.el.pause();
        playing = undefined;
      }
    } else start();
  });
}

/** Leaving the game (the test view): the music fades away. */
export function stopMusic(): void {
  wanted = undefined;
  stopAll(FADE_OUT);
  if (typeof document !== "undefined") delete document.documentElement.dataset.music;
}
