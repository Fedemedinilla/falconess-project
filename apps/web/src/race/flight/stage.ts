/**
 * The side view of a v3 race on a canvas (the approved design7 mock, `.work/design7/mock`): the
 * four altitude bands with their two lines, every runner's figure and wings posed from her phase,
 * the takeoff gestures, the ground thruster hops, dives with speed lines and impact, the fight up
 * high, the banner and the chip of the runner the camera follows, the «Desde arriba» inset and the
 * order strip. Everything it draws is read from `FlightModel` and the story helpers of
 * @falconess/race-view; every word comes from `StageWords` (es.json). Pure drawing: the screen
 * owns the clock.
 */
import {
  activeOverlays,
  altitudeAt,
  type FlightAhead,
  type FlightModel,
  type FlightOverlay,
  type FlightTrack,
  hopAt,
  insetEvent,
  lineAt,
  orderAt,
  FLIGHT_PHASE as PH,
  phaseAt,
  positionAt,
  rowOf,
  speedAt,
  type TakeoffStyle,
} from "@falconess/race-view";
import type { Position, RaceLog, SegmentType, Style } from "@falconess/schema";

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A stable pseudo-random number in [0, 1) for decoration (dust, mesas), never for the race. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const FONT = (w: number, s: number) =>
  `${w} ${s}px "Barlow Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;

export const POS_COLOR: Record<Position, { c: string; c1: string; c2: string; glyph: string }> = {
  lead: { c: "#6fb8ff", c1: "#1d5fc4", c2: "#9fe3ff", glyph: "▲" },
  pack: { c: "#4be3a0", c1: "#1f8a5c", c2: "#7ff0c0", glyph: "■" },
  stalk: { c: "#ffb340", c1: "#c2711a", c2: "#ffd27a", glyph: "◆" },
  closer: { c: "#b48cff", c1: "#6a35c4", c2: "#d6b8ff", glyph: "▼" },
};
const WING: Record<Style, { wl: number; fan: number; glow: string }> = {
  dive: { wl: 0.95, fan: 0.07, glow: "#ff5a6e" },
  hover: { wl: 0.82, fan: 0.42, glow: "#35e0ff" },
  glide: { wl: 1.25, fan: 0.26, glow: "#e8f56a" },
  ground: { wl: 0.58, fan: 0.2, glow: "#ffb13b" },
};
export const STYLE_COLOR: Record<TakeoffStyle, string> = {
  lance: "#ff5a6e",
  column: "#35e0ff",
  ramp: "#e8f56a",
  turbine: "#ffb13b",
  neutral: "#c9d2de",
};
const SEG_COLOR: Record<SegmentType, string> = {
  flat: "#b8794a",
  curves: "#a9683f",
  water: "#2f7fb8",
  jump: "#c98b55",
  climb: "#9c6a3a",
  descent: "#8a5634",
  canyon: "#7a4a36",
};
const HOP_H = 0.2;

/** Banner and chip colors by overlay id: background and ink. */
export const OVERLAY_COLOR: Partial<Record<FlightOverlay["id"], [string, string]>> = {
  takeoffCost: ["#ff5468", "#fff"],
  lowBand: ["#4be3a0", "#0a0e16"],
  airClean: ["#4be3a0", "#0a0e16"],
  airRough: ["#ff8a5c", "#0a0e16"],
  dirty: ["#ffb340", "#0a0e16"],
  over: ["#4be3a0", "#0a0e16"],
  knock: ["#ff5468", "#fff"],
  noEnergy: ["#ff5468", "#fff"],
  fallNoDive: ["#ff5468", "#fff"],
  lowNoDive: ["#ff5468", "#fff"],
  grandDive: ["#b48cff", "#fff"],
  dive: ["#ff5a6e", "#fff"],
  nerveHeld: ["#ffc83d", "#0a0e16"],
  flinch: ["#ff5468", "#fff"],
  skillDive: ["#e9a8ff", "#0a0e16"],
  peak: ["#b48cff", "#fff"],
  payoff: ["#ffc83d", "#0a0e16"],
  touchLoss: ["#ff5468", "#fff"],
  passAir: ["#35e0ff", "#0a0e16"],
  passSide: ["#78e6ff", "#0a0e16"],
  boxedIn: ["#ff5468", "#fff"],
  doorClosed: ["#ffc83d", "#0a0e16"],
  diagonal: ["#4be3a0", "#0a0e16"],
  switchOut: ["#78e6ff", "#0a0e16"],
  switchIn: ["#78e6ff", "#0a0e16"],
  escape: ["#9fb4c8", "#0a0e16"],
  detour: ["#ffb13b", "#0a0e16"],
  kickShort: ["#ff5468", "#fff"],
  noKick: ["#ff5468", "#fff"],
  noLift: ["#ff5468", "#fff"],
  finish: ["#ffc83d", "#0a0e16"],
  passedBy: ["#ff8a5c", "#0a0e16"],
  doorOnHer: ["#ff5468", "#fff"],
  boxing: ["#ffb340", "#0a0e16"],
  hit: ["#ff5468", "#fff"],
};
export function overlayColor(o: FlightOverlay): [string, string] {
  if (o.id === "takeoff" || o.id === "takeoffLow")
    return [o.event.kind === "takeoff" ? STYLE_COLOR[o.event.style] : "#fff", "#0a0e16"];
  return OVERLAY_COLOR[o.id] ?? ["#f4f7fb", "#0a0e16"];
}

/** Every word the stage draws (from es.json, built by the screen). */
export type StageWords = {
  /** SUELO, BAJA, ALTA, TECHO. */
  readonly bands: readonly string[];
  /** adentro, afuera (small, by the band lines) and ADENTRO, AFUERA (the inset). */
  readonly lines: readonly string[];
  readonly linesUpper: readonly string[];
  segment(type: SegmentType): string;
  readonly descent: string;
  readonly final: string;
  readonly finishLine: string;
  readonly sideBySide: string;
  readonly wingToWing: string;
  gap(m: string): string;
  ahead(tag: string): string;
  inset(band: string): string;
  /** Her tag over her head: "▲ C3 · LANZA". */
  tag(lane: number): string;
  overlay(o: FlightOverlay): string;
  countdown(a: FlightAhead, metres: number): string;
};

type Pose = {
  run: number;
  lean: number;
  wa: number;
  wl: number;
  fan: number;
  vs: number;
  flame: number;
  glow: number;
  visor: string;
  heat: number;
  seed: number;
  flap: number;
  wingCol: string;
  tremble: number;
  cough: number;
  look: number;
  sparks: number;
  crouch: number;
  pack: number;
  fdx: number;
  fdy: number;
};

type Head = { hx: number; hy: number } | null;

export type StageState = {
  focus: number;
  /** Fractional frame row. */
  row: number;
  /** Seconds of wall time, for decoration only (flames, flaps). */
  now: number;
  reduced: boolean;
  overlays: readonly FlightOverlay[];
  ahead: readonly FlightAhead[];
  /** Screen shake left (s) and its amplitude, after an impact. */
  shake: number;
  shakeAmp: number;
};

const TOP = 92;

export class FlightStage {
  readonly #cv: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #m: FlightModel;
  readonly #log: RaceLog;
  readonly #w: StageWords;
  #W = 360;
  #H = 470;
  #DPR = 1;
  #gy = 0;
  #bandH = 0;
  #S = 0;
  #ppm = 6;
  #SPAN = 50;
  #groundH = 0;
  #camL = 0;
  #anchor = 0.36;
  #st: StageState = {
    focus: 0,
    row: 0,
    now: 0,
    reduced: false,
    overlays: [],
    ahead: [],
    shake: 0,
    shakeAmp: 0,
  };
  #heads: Head[] = [];

  constructor(cv: HTMLCanvasElement, log: RaceLog, model: FlightModel, words: StageWords) {
    const ctx = cv.getContext("2d");
    if (ctx === null) throw new Error("no 2d canvas");
    this.#cv = cv;
    this.#ctx = ctx;
    this.#m = model;
    this.#log = log;
    this.#w = words;
    this.layout();
  }

  /** Size to the canvas' box (a phone: as tall as 1.3 × its width, 450-560 px). */
  layout(): void {
    const r = this.#cv.getBoundingClientRect();
    this.#W = Math.max(280, r.width || this.#cv.parentElement?.clientWidth || 360);
    this.#H = Math.round(clamp(this.#W * 1.32, 450, 560));
    this.#DPR = Math.min(2, window.devicePixelRatio || 1);
    this.#cv.style.height = `${this.#H}px`;
    this.#cv.width = Math.round(this.#W * this.#DPR);
    this.#cv.height = Math.round(this.#H * this.#DPR);
    this.#groundH = Math.round(this.#H * 0.12);
    this.#gy = this.#H - this.#groundH - 30;
    this.#S = Math.round(clamp(this.#H * 0.1, 44, 56));
    this.#bandH = (this.#gy + 10 - (TOP + this.#S + 6)) / 3.28;
    this.#SPAN = this.#W < 380 ? 46 : 50;
    this.#ppm = this.#W / this.#SPAN;
  }

  /** The lane under a tap (within 40 px of a figure), or −1. */
  laneAt(px: number, py: number): number {
    let best = -1;
    let bd = 40;
    for (const t of this.#m.tracks) {
      const x = this.#X(this.#posM(t));
      const y = this.#yOf(t, this.#alt(t)) - this.#figS(t) * 0.5;
      const d = Math.hypot(x - px, y - py);
      if (d < bd) {
        bd = d;
        best = t.lane;
      }
    }
    return best;
  }

  // --- model access at the current row --------------------------------------------------------
  #tr(i: number): FlightTrack {
    const t = this.#m.tracks[i] ?? this.#m.tracks[0];
    if (t === undefined) throw new Error("empty race");
    return t;
  }
  #posM(t: FlightTrack, row = this.#st.row) {
    return positionAt(t, row) / 1000;
  }
  #alt(t: FlightTrack, row = this.#st.row) {
    return altitudeAt(t, clamp(row, 0, this.#m.rows));
  }
  #band(t: FlightTrack, row = this.#st.row) {
    return rowOf(t.band, row);
  }
  #pos(t: FlightTrack): Position {
    return this.#log.entries[t.lane]?.position ?? "pack";
  }
  #wing(t: FlightTrack): Style {
    return this.#log.entries[t.lane]?.style ?? "glide";
  }
  #X = (m: number) => (m - this.#camL) * this.#ppm;
  #feetY = (t: FlightTrack) => this.#gy + 2 + t.lane * 3;
  #LVL = (k: number) => this.#gy + 10 - k * this.#bandH;
  #LDY = () => this.#bandH * 0.26;
  #depth(t: FlightTrack, a: number, row = this.#st.row) {
    return lineAt(t, row) * clamp(a, 0, 1);
  }
  #yOf(t: FlightTrack, a: number, row = this.#st.row) {
    return this.#feetY(t) - a * this.#bandH - this.#depth(t, a, row) * this.#LDY();
  }
  #figS(t: FlightTrack) {
    return this.#S * (0.9 + t.lane * 0.016) * (1 - 0.16 * this.#depth(t, this.#alt(t)));
  }
  #segAt(m: number): SegmentType {
    for (const s of this.#log.geometry.segments)
      if (m * 1000 >= s.startMm && m * 1000 < s.endMm) return s.type;
    return "flat";
  }

  // --- drawing helpers --------------------------------------------------------------------------
  #hexA(hex: string, a: number) {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  #shade(hex: string, k: number) {
    const n = Number.parseInt(hex.slice(1), 16);
    const f = k < 0 ? 0 : 255;
    const m = Math.abs(k);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(lerp(v, f, m)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  #heatCol(hf: number, a: number) {
    const r = lerp(140, 255, clamp(hf * 1.6, 0, 1));
    const g = lerp(230, 120, clamp(hf * 1.4, 0, 1));
    const b = lerp(255, 40, clamp(hf * 1.8, 0, 1));
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }
  #rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.#ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  #chip(x: number, y: number, text: string, bg: string, fg: string, size = 13, align = "l") {
    const c = this.#ctx;
    c.font = FONT(700, size);
    const w = c.measureText(text).width + 14;
    const h = size + 9;
    let x0 = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
    x0 = clamp(x0, 4, this.#W - w - 4);
    c.fillStyle = bg;
    this.#rr(x0, y - h / 2, w, h, h / 2);
    c.fill();
    c.fillStyle = fg;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(text, x0 + 7, y + 1);
  }
  #flame(x: number, y: number, dx: number, dy: number, len: number, wid: number, hf: number) {
    if (len < 1) return;
    const c = this.#ctx;
    const jit = this.#st.reduced ? 1 : 0.85 + 0.3 * hash(Math.floor(this.#st.now * 30) + x);
    const L = len * jit;
    const nx = -dy;
    const ny = dx;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const ll = L * (1 - k * 0.28);
      const ww = wid * (1 - k * 0.3);
      c.fillStyle =
        k === 0
          ? this.#heatCol(hf, 0.35)
          : k === 1
            ? this.#heatCol(hf * 0.6, 0.6)
            : "rgba(255,255,255,.85)";
      c.beginPath();
      c.moveTo(x + nx * ww, y + ny * ww);
      c.quadraticCurveTo(
        x + dx * ll * 0.5 + nx * ww * 1.2,
        y + dy * ll * 0.5 + ny * ww * 1.2,
        x + dx * ll,
        y + dy * ll,
      );
      c.quadraticCurveTo(
        x + dx * ll * 0.5 - nx * ww * 1.2,
        y + dy * ll * 0.5 - ny * ww * 1.2,
        x - nx * ww,
        y - ny * ww,
      );
      c.closePath();
      c.fill();
    }
    const g = c.createRadialGradient(x, y, 0, x, y, wid * 3.5);
    g.addColorStop(0, this.#heatCol(hf, 0.55));
    g.addColorStop(1, this.#heatCol(hf, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, wid * 3.5, 0, TAU);
    c.fill();
    c.restore();
  }

  /** A side figure; (x, y) are her feet. Returns her head. */
  #fig(x: number, y: number, s: number, col: { c1: string; c2: string; glow: string }, p: Pose) {
    const c = this.#ctx;
    const RM = this.#st.reduced;
    const NOW = this.#st.now;
    const u = s / 100;
    c.save();
    c.translate(x, y);
    const tr = p.tremble && !RM ? Math.sin(NOW * 55 + x) * 1.6 * u * p.tremble : 0;
    c.translate(tr * 0.5, tr * 0.3);
    const lean = p.lean;
    const dX = Math.sin(lean);
    const dY = -Math.cos(lean);
    const ph = NOW * 13 + p.seed;
    const run = p.run ? 1 : 0;
    const bob = run * Math.abs(Math.sin(ph)) * 2.5 * u;
    c.translate(0, -bob + p.crouch * 8 * u);
    const hipX = 0;
    const hipY = -46 * u * (1 - p.crouch * 0.25);
    const shX = hipX + dX * 30 * u;
    const shY = hipY + dY * 30 * u;
    const hdX = shX + dX * 12 * u + 2 * u * Math.cos(lean);
    const hdY = shY + dY * 12 * u;
    const backX = -Math.cos(lean);
    const backY = -Math.sin(lean);
    const rootX = shX + backX * 5 * u - dX * 4 * u;
    const rootY = shY + backY * 5 * u - dY * 4 * u;
    const wing = (far: boolean) => {
      const flap = p.flap && !RM ? Math.sin(NOW * p.flap + (far ? 0.6 : 0)) * 0.08 : 0;
      const jit = p.tremble && !RM ? Math.sin(NOW * 47 + (far ? 1 : 0)) * 0.14 * p.tremble : 0;
      const base = p.wa + (far ? -p.vs : p.vs * 0.4) + flap + jit;
      const len = 58 * u * p.wl * (far ? 0.9 : 1);
      const pts: [number, number][] = [];
      for (let k = 0; k < 3; k++) {
        const a = base - p.fan * (k - 1);
        pts.push([
          rootX + Math.cos(a) * len * (1 - k * 0.16),
          rootY + Math.sin(a) * len * (1 - k * 0.16),
        ]);
      }
      c.fillStyle = far ? "rgba(10,14,22,.85)" : "rgba(18,24,38,.9)";
      c.beginPath();
      c.moveTo(rootX, rootY);
      for (const q of pts) c.lineTo(q[0], q[1]);
      c.lineTo(rootX + backX * 8 * u + dX * -6 * u, rootY + backY * 8 * u + dY * -6 * u + 4 * u);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.22)";
      c.lineWidth = Math.max(1, 0.8 * u);
      for (const q of pts) {
        c.beginPath();
        c.moveTo(rootX, rootY);
        c.lineTo(q[0], q[1]);
        c.stroke();
      }
      const ga = clamp(p.glow, 0, 1.3) * (far ? 0.5 : 1);
      c.save();
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = this.#hexA(p.wingCol, Math.min(1, ga * 0.4));
      c.lineWidth = (5 + p.glow * 4) * u;
      c.beginPath();
      c.moveTo(rootX, rootY);
      for (const q of pts) c.lineTo(q[0], q[1]);
      c.stroke();
      c.strokeStyle = this.#hexA(p.wingCol, Math.min(1, ga));
      c.lineWidth = 1.6 * u;
      c.stroke();
      c.restore();
    };
    wing(true);
    c.lineCap = "round";
    const leg = (far: boolean) => {
      let a: number;
      let b: number;
      if (run) {
        const q = ph + (far ? PI : 0);
        a = Math.sin(q) * 0.85;
        b = 0.25 + Math.max(0, -Math.cos(q)) * 1.3;
      } else {
        a = -lean * 0.95 + 0.25 + (far ? 0.18 : 0);
        b = far ? 0.7 : 0.45;
      }
      if (p.crouch) {
        a = 0.9 + (far ? 0.2 : 0);
        b = 1.6;
      }
      const kx = hipX + Math.sin(a) * 22 * u;
      const ky = hipY + Math.cos(a) * 22 * u;
      const fx = kx + Math.sin(a - b) * 22 * u;
      const fy = ky + Math.cos(a - b) * 22 * u;
      c.strokeStyle = far ? this.#shade(col.c1, -0.6) : this.#shade(col.c1, -0.35);
      c.lineWidth = 7 * u;
      c.beginPath();
      c.moveTo(hipX, hipY);
      c.lineTo(kx, ky);
      c.lineTo(fx, fy);
      c.stroke();
      if (p.sparks && !far && !RM && run && Math.cos(ph) > 0.6) {
        c.fillStyle = "rgba(255,200,120,.9)";
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(
            fx - 6 * u - i * 5 * u,
            fy - hash(i + Math.floor(NOW * 20)) * 6 * u,
            1.6 * u,
            0,
            TAU,
          );
          c.fill();
        }
      }
    };
    const arm = (far: boolean) => {
      const a = run ? Math.sin(ph + (far ? 0 : PI)) * 0.9 : -0.6;
      c.strokeStyle = far ? this.#shade(col.c1, -0.55) : this.#shade(col.c1, -0.12);
      c.lineWidth = 5 * u;
      const ex = shX + Math.sin(a + lean) * 14 * u;
      const ey = shY + Math.cos(a + lean) * 14 * u;
      c.beginPath();
      c.moveTo(shX, shY);
      c.lineTo(ex, ey);
      c.lineTo(
        ex + Math.sin(a + lean + 1.2) * 12 * u,
        ey + Math.cos(a + lean + 1.2) * 12 * u * -0.2 - 4 * u,
      );
      c.stroke();
    };
    leg(true);
    arm(true);
    const pkX = lerp(hipX, shX, 0.55) + backX * 9 * u;
    const pkY = lerp(hipY, shY, 0.55) + backY * 9 * u;
    const pk = p.pack;
    c.save();
    c.translate(pkX, pkY);
    c.rotate(lean);
    c.fillStyle = "#3a4352";
    this.#rr(-6 * u * pk, -12 * u, 12 * u * pk, 24 * u, 3 * u);
    c.fill();
    c.strokeStyle = col.c2;
    c.lineWidth = 1.2 * u;
    c.stroke();
    c.restore();
    const nzX = pkX + backX * 6 * u * pk - dX * 10 * u;
    const nzY = pkY + backY * 6 * u * pk - dY * 10 * u;
    c.fillStyle = "#1a1e26";
    c.beginPath();
    c.arc(nzX, nzY, 3.3 * u * pk, 0, TAU);
    c.fill();
    this.#flame(nzX, nzY, p.fdx, p.fdy, p.flame * 52 * u, 3.6 * u * pk, p.heat);
    if (p.cough && !RM)
      for (let i = 0; i < 4; i++) {
        const q = (NOW * 1.4 + i / 4) % 1;
        c.fillStyle = `rgba(120,120,128,${0.55 * (1 - q)})`;
        c.beginPath();
        c.arc(
          nzX + p.fdx * q * 34 * u,
          nzY + p.fdy * q * 34 * u - q * 10 * u,
          (3 + q * 8) * u,
          0,
          TAU,
        );
        c.fill();
      }
    c.strokeStyle = col.c1;
    c.lineWidth = 15 * u;
    c.beginPath();
    c.moveTo(hipX, hipY);
    c.lineTo(shX, shY);
    c.stroke();
    c.strokeStyle = col.c2;
    c.lineWidth = 2 * u;
    c.beginPath();
    c.moveTo(hipX - backX * 6 * u, hipY - backY * 6 * u);
    c.lineTo(shX - backX * 6 * u, shY - backY * 6 * u);
    c.stroke();
    leg(false);
    const wv = Math.sin(NOW * 9 + p.seed) * 3 * u;
    c.strokeStyle = "#3d4b5e";
    c.lineWidth = 4 * u;
    c.beginPath();
    c.moveTo(hdX + backX * 7 * u, hdY + backY * 7 * u);
    c.quadraticCurveTo(
      hdX + backX * 16 * u,
      hdY + backY * 16 * u + wv,
      hdX + backX * 26 * u,
      hdY + backY * 26 * u + 4 * u - wv,
    );
    c.stroke();
    c.fillStyle = "#252d3a";
    c.beginPath();
    c.arc(hdX, hdY, 9.5 * u, 0, TAU);
    c.fill();
    const rot = (lean - 0.3) * 0.55 + p.look;
    c.strokeStyle = col.c2;
    c.lineWidth = 2 * u;
    c.beginPath();
    c.arc(hdX, hdY, 9.5 * u, PI * 1.1 + rot, PI * 1.5 + rot);
    c.stroke();
    c.save();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = this.#hexA(p.visor, 0.4);
    c.lineWidth = 6 * u;
    c.beginPath();
    c.arc(hdX + 1 * u, hdY, 8 * u, -0.75 + rot, 0.55 + rot);
    c.stroke();
    c.restore();
    c.strokeStyle = p.visor;
    c.lineWidth = 3.2 * u;
    c.beginPath();
    c.arc(hdX + 1 * u, hdY, 8 * u, -0.75 + rot, 0.55 + rot);
    c.stroke();
    arm(false);
    wing(false);
    c.restore();
    return { hx: x + hdX, hy: y + hdY - bob };
  }

  /** Her pose from the log: phase, band, speed, boost, the takeoff she is about to make. */
  #pose(t: FlightTrack, row: number): Pose {
    const ph = phaseAt(t, row);
    const a = this.#alt(t, row);
    const va = (this.#alt(t, row + 1) - this.#alt(t, row - 1)) / 2;
    const v = speedAt(t, row) / 1000;
    const wing = this.#wing(t);
    const Wg = WING[wing];
    const her = t.lane === this.#st.focus;
    const p: Pose = {
      run: 0,
      lean: 0.28,
      wa: PI * 0.62,
      wl: Wg.wl * 0.62,
      fan: Wg.fan * 0.5,
      vs: 0.1,
      flame: 0.3,
      glow: her ? 0.45 : 0.25,
      visor: "#9fe3ff",
      heat: 0.2,
      seed: t.lane * 1.7,
      flap: 0,
      wingCol: Wg.glow,
      tremble: 0,
      cough: 0,
      look: 0,
      sparks: 0,
      crouch: 0,
      pack: wing === "ground" ? 1.35 : 1,
      fdx: -1,
      fdy: 0,
    };
    const vx = v * this.#ppm;
    const vy = -va * 15 * this.#bandH;
    const n = Math.hypot(vx, vy) || 1;
    p.fdx = -vx / n;
    p.fdy = (-vy / n) * 0.9 + 0.12;
    const m = Math.hypot(p.fdx, p.fdy) || 1;
    p.fdx /= m;
    p.fdy /= m;
    const boost = rowOf(t.boosting, row) !== 0;
    const style = t.style;
    if (ph === PH.ground || ph === PH.surge || ph === PH.stumble) {
      p.run = 1;
      p.flame = boost ? 0.85 : 0.28;
      if (wing === "ground" && boost) {
        p.flame = 1.1;
        p.heat = 0.6;
      }
      if (ph === PH.surge)
        Object.assign(p, {
          lean: 0.46,
          flame: 1,
          glow: 1,
          heat: 0.9,
          sparks: 1,
          wa: PI * 0.58,
          wl: Wg.wl * 0.8,
          fan: 0.05,
        });
      if (ph === PH.stumble)
        Object.assign(p, {
          lean: 0.05,
          tremble: 1,
          visor: "#ff3b4f",
          cough: 1,
          flame: 0.12,
          wa: PI * 1.1,
          wl: Wg.wl,
          fan: 0.46,
          look: 0.5,
        });
      if (wing === "ground" && this.#segAt(this.#posM(t, row)) === "curves") p.sparks = 1;
      // the thruster hop: crouch, the little jump with the flare at its top, back on the ground
      const hs = hopAt(t, row);
      if (hs >= 0 && ph === PH.ground) {
        if (hs < 0.18) {
          p.crouch = hs / 0.18;
          p.lean = 0.4;
        } else Object.assign(p, { run: 0.35, lean: 0.5, wa: PI * 0.7, wl: Wg.wl * 0.75 });
        const fl = hs < 0.25 ? hs / 0.25 : hs < 0.7 ? 1 : (1 - hs) / 0.3;
        p.flame = 0.5 + 1.3 * fl;
        p.heat = 0.6 + 0.35 * fl;
        p.glow = Math.max(p.glow, 0.5 + 0.6 * fl);
      }
      // the takeoff she is about to make: the wing's gesture in the last second
      const nx = t.events.find(
        (e) => e.kind === "takeoff" && e.tick > row && e.tick - row <= 15 && e.fromBand === 0,
      );
      if (nx?.kind === "takeoff") {
        const q = 1 - (nx.tick - row) / 15;
        if (nx.style === "lance")
          Object.assign(p, {
            crouch: q,
            lean: 0.28 + 0.25 * q,
            wa: PI * 0.55,
            wl: Wg.wl * 0.7,
            glow: 0.4 + q,
            flame: 0.3 + q * 0.6,
            heat: 0.7,
          });
        else if (nx.style === "column")
          Object.assign(p, {
            wa: PI * (1.05 + 0.3 * q),
            wl: Wg.wl * (0.7 + 0.3 * q),
            fan: 0.4,
            tremble: q * 0.8,
            glow: 0.4 + q,
          });
        else if (nx.style === "ramp")
          Object.assign(p, {
            wa: PI * (0.8 + 0.25 * q),
            wl: Wg.wl * (0.7 + 0.45 * q),
            fan: 0.3 + 0.2 * q,
            glow: 0.4 + 0.8 * q,
          });
        else if (nx.style === "turbine")
          Object.assign(p, { flame: 0.6 + 0.8 * q, heat: 0.6 + 0.3 * q, lean: 0.4 + 0.3 * q });
      }
    } else if (ph === PH.climb) {
      p.glow = 1.05;
      p.heat = 0.7;
      if (style === "lance")
        Object.assign(p, {
          lean: 0.1,
          wa: PI * 0.5,
          wl: Wg.wl * 0.8,
          fan: 0.05,
          vs: 0.04,
          flame: 1.35,
          heat: 0.95,
        });
      else if (style === "column")
        Object.assign(p, { lean: 0.3, wa: PI * 1.4, wl: Wg.wl, fan: 0.5, flap: 10, flame: 1 });
      else if (style === "ramp")
        Object.assign(p, { lean: 1.12, wa: PI * 1.05, wl: Wg.wl * 1.05, fan: 0.32, flame: 0.95 });
      else
        Object.assign(p, {
          lean: 0.85,
          wa: PI * 0.92,
          wl: Wg.wl,
          fan: 0.2,
          flame: 1.25,
          heat: 0.6,
        });
    } else if (ph === PH.hold || ph === PH.jump || ph === PH.knocked) {
      Object.assign(p, {
        lean: style === "ramp" ? 1.05 : 0.85,
        wa: PI * 1.24,
        wl: Wg.wl,
        fan: Wg.fan + 0.1,
        flap: style === "column" ? 7 : 3,
        flame: 0.35,
        glow: her ? 0.75 : 0.5,
      });
      if (style === "column") p.tremble = 0.25;
      if (wing === "ground") Object.assign(p, { lean: 0.8, wa: PI * 0.95, flame: 1.1, heat: 0.6 });
      if (ph === PH.jump) Object.assign(p, { lean: 0.65, wa: PI * 1.15, flame: 0.6, flap: 4 });
      if (rowOf(t.dirty, row)) {
        p.tremble = 1;
        p.visor = "#ffb340";
      }
      if (ph === PH.knocked)
        Object.assign(p, { tremble: 1.4, visor: "#ff3b4f", wa: PI * 1.08, fan: 0.5, look: 0.6 });
    } else if (ph === PH.dive) {
      const steep = clamp(-va * 6, 0, 1);
      p.lean = 1.55 + 0.55 * steep;
      Object.assign(p, {
        wa: p.lean + PI / 2 - 0.18,
        wl: Wg.wl * 0.95,
        fan: 0.05,
        vs: 0.03,
        flame: 1.2,
        glow: 1.15,
        heat: 1,
      });
      const nv = t.events.find(
        (e) => e.kind === "nerve" && !e.held && e.tick >= row && e.tick - row <= 3,
      );
      if (nv)
        Object.assign(p, {
          wa: PI * 1.12,
          wl: Wg.wl * 1.1,
          fan: 0.46,
          tremble: 1,
          visor: "#ff3b4f",
          flame: 0.15,
          cough: 1,
          lean: 1.1,
        });
    } else if (ph === PH.falling)
      Object.assign(p, {
        lean: 0.7,
        wa: PI * 1.1,
        wl: Wg.wl,
        fan: 0.48,
        tremble: 1,
        visor: "#ff3b4f",
        flame: 0.12,
        cough: 1,
        glow: 0.2,
      });
    void a;
    return p;
  }

  // --- scene ------------------------------------------------------------------------------------
  #sky() {
    const c = this.#ctx;
    const { gy } = { gy: this.#gy };
    const g = c.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, "#0b1028");
    g.addColorStop(0.45, "#3a2a58");
    g.addColorStop(0.82, "#c4644a");
    g.addColorStop(1, "#eda463");
    c.fillStyle = g;
    c.fillRect(0, 0, this.#W, gy + 1);
    const sx = this.#W * 0.78;
    const sy = gy - this.#H * 0.05;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, this.#W * 0.36);
    sg.addColorStop(0, "rgba(255,230,170,.8)");
    sg.addColorStop(0.12, "rgba(255,200,120,.45)");
    sg.addColorStop(1, "rgba(255,160,90,0)");
    c.fillStyle = sg;
    c.fillRect(0, 0, this.#W, gy);
    const yT = this.#LVL(3);
    const tg = c.createLinearGradient(0, yT - this.#bandH * 0.6, 0, yT + this.#bandH * 0.4);
    tg.addColorStop(0, "rgba(180,140,255,.10)");
    tg.addColorStop(1, "rgba(180,140,255,0)");
    c.fillStyle = tg;
    c.fillRect(0, yT - this.#bandH * 0.6, this.#W, this.#bandH);
  }
  #mesas(hz: number, off: number, scale: number, col: string, seed: number) {
    const c = this.#ctx;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, hz + 1);
    const sp = 90 * scale;
    const k0 = Math.floor(off / sp) - 1;
    for (let k = k0; k < k0 + Math.ceil(this.#W / sp) + 3; k++) {
      const x = k * sp - off;
      const hg = (10 + hash(k * 1.7 + seed) * 34) * scale;
      const w = (30 + hash(k + seed * 3) * 50) * scale;
      c.lineTo(x, hz + 1);
      c.lineTo(x + 6 * scale, hz - hg);
      c.lineTo(x + w, hz - hg);
      c.lineTo(x + w + 6 * scale, hz + 1);
    }
    c.lineTo(this.#W, hz + 1);
    c.closePath();
    c.fill();
  }
  #bands() {
    const c = this.#ctx;
    c.font = FONT(700, 11);
    c.textAlign = "left";
    c.textBaseline = "bottom";
    for (let k = 1; k <= 3; k++) {
      const y = this.#LVL(k);
      const yo = y - this.#LDY();
      c.fillStyle = k === 3 ? "rgba(214,184,255,.05)" : "rgba(255,255,255,.035)";
      c.fillRect(0, yo, this.#W, y - yo);
      c.strokeStyle = k === 3 ? "rgba(214,184,255,.22)" : "rgba(255,255,255,.10)";
      c.setLineDash([2, 7]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, yo);
      c.lineTo(this.#W, yo);
      c.stroke();
      c.strokeStyle = k === 3 ? "rgba(214,184,255,.38)" : "rgba(255,255,255,.16)";
      c.setLineDash([3, 6]);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(this.#W, y);
      c.stroke();
      c.setLineDash([]);
      const name = this.#w.bands[k] ?? "";
      c.fillStyle = k === 3 ? "rgba(230,214,255,.75)" : "rgba(255,255,255,.6)";
      c.fillText(name, 8, y - 3);
      const bw = c.measureText(name).width;
      c.font = FONT(600, 10);
      c.fillStyle = "rgba(255,255,255,.42)";
      c.fillText(this.#w.lines[0] ?? "", 14 + bw, y - 3);
      c.fillText(this.#w.lines[1] ?? "", 8, yo - 2);
      c.font = FONT(700, 11);
    }
  }
  #track() {
    const c = this.#ctx;
    const { gy } = { gy: this.#gy };
    const X = this.#X;
    const m0 = this.#camL - 4;
    const m1 = this.#camL + this.#SPAN + 4;
    const segs = this.#log.geometry.segments;
    for (const s of segs) {
      const a = s.startMm / 1000;
      const b = s.endMm / 1000;
      if (b < m0 || a > m1) continue;
      if (s.type === "canyon") {
        c.fillStyle = "rgba(58,30,30,.78)";
        for (let m = Math.floor(Math.max(a, m0) / 7) * 7; m < Math.min(b, m1); m += 7) {
          const x = X(m);
          const h = this.#bandH * (1.35 + hash(m) * 0.5);
          c.beginPath();
          c.moveTo(x, gy);
          c.lineTo(x + 3, gy - h);
          c.lineTo(x + 7 * this.#ppm - 2, gy - h * 0.92);
          c.lineTo(x + 7 * this.#ppm, gy);
          c.closePath();
          c.fill();
        }
      }
      if (s.type === "climb") {
        c.fillStyle = "rgba(120,70,48,.55)";
        c.beginPath();
        c.moveTo(X(a), gy);
        c.quadraticCurveTo(X((a + b) / 2), gy - this.#bandH * 0.9, X(b), gy);
        c.closePath();
        c.fill();
      }
    }
    c.fillStyle = "#8a5433";
    c.fillRect(0, gy, this.#W, this.#H - gy);
    const gh = this.#groundH;
    for (const s of segs) {
      const a = s.startMm / 1000;
      const b = s.endMm / 1000;
      if (b < m0 || a > m1) continue;
      const x0 = Math.max(-2, X(a));
      const x1 = Math.min(this.#W + 2, X(b));
      c.fillStyle = SEG_COLOR[s.type];
      c.fillRect(x0, gy, x1 - x0, gh);
      if (s.type === "water") {
        c.strokeStyle = "rgba(200,235,255,.5)";
        c.lineWidth = 1.5;
        for (let r = 0; r < 3; r++) {
          c.beginPath();
          for (let x = x0; x <= x1; x += 6)
            c.lineTo(
              x,
              gy +
                6 +
                (r * gh) / 3.4 +
                Math.sin(x * 0.12 + (this.#st.reduced ? 0 : this.#st.now * 3) + r) * 1.6,
            );
          c.stroke();
        }
      }
      if (s.type === "curves") {
        c.strokeStyle = "rgba(255,230,200,.28)";
        c.lineWidth = 2;
        for (let m = Math.ceil(Math.max(a, m0) / 4) * 4; m < Math.min(b, m1); m += 4) {
          const x = X(m);
          c.beginPath();
          c.moveTo(x, gy + 5);
          c.lineTo(x + 6, gy + gh / 2);
          c.lineTo(x, gy + gh - 5);
          c.stroke();
        }
      }
      if (s.type === "jump") {
        const xr = X(a);
        c.fillStyle = "#5b3622";
        c.fillRect(X(a + 6), gy, Math.max(0, X(b - 6) - X(a + 6)), gh * 0.7);
        c.fillStyle = "#d8a066";
        c.beginPath();
        c.moveTo(xr - 10, gy);
        c.lineTo(xr + 6, gy - 10);
        c.lineTo(xr + 6, gy);
        c.closePath();
        c.fill();
      }
      if (s.type === "descent" || s.type === "climb") {
        c.strokeStyle = "rgba(255,230,200,.22)";
        c.lineWidth = 2;
        for (let m = Math.ceil(Math.max(a, m0) / 5) * 5; m < Math.min(b, m1); m += 5) {
          const x = X(m);
          c.beginPath();
          if (s.type === "descent") {
            c.moveTo(x, gy + 4);
            c.lineTo(x + 8, gy + gh - 4);
          } else {
            c.moveTo(x, gy + gh - 4);
            c.lineTo(x + 8, gy + 4);
          }
          c.stroke();
        }
      }
      const xl = X(a);
      if (xl > -60 && xl < this.#W - 10 && s.type !== "flat")
        this.#chip(
          Math.max(4, xl + 4),
          gy + gh - 11,
          s.type === "descent" ? this.#w.descent : this.#w.segment(s.type),
          "rgba(8,10,16,.72)",
          "#fff",
          11,
        );
    }
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, gy);
    c.lineTo(this.#W, gy);
    c.stroke();
    for (let m = Math.ceil(m0 / 10) * 10; m <= m1; m += 10) {
      const x = X(m);
      c.strokeStyle = `rgba(255,255,255,${m % 50 === 0 ? 0.6 : 0.3})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, gy);
      c.lineTo(x, gy + (m % 50 === 0 ? 9 : 5));
      c.stroke();
    }
    const xf = X(this.#m.finalStartMm / 1000);
    if (xf > -30 && xf < this.#W + 30) {
      c.strokeStyle = "rgba(255,200,61,.85)";
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(xf, gy + gh);
      c.lineTo(xf, this.#LVL(3) - 14);
      c.stroke();
      c.setLineDash([]);
      this.#chip(xf, this.#LVL(3) - 24, this.#w.final, "#ffc83d", "#1a1200", 11, "c");
    }
    const xm = X(this.#m.lengthMm / 1000);
    if (xm > -30 && xm < this.#W + 30) {
      for (let k = 0; k < 12; k++) {
        c.fillStyle = k % 2 ? "#fff" : "#111";
        c.fillRect(xm - 3, gy + k * (gh / 12), 6, gh / 12);
      }
      c.strokeStyle = "rgba(255,255,255,.85)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(xm, gy);
      c.lineTo(xm, this.#LVL(3) - 14);
      c.stroke();
      this.#chip(xm, this.#LVL(3) - 24, this.#w.finishLine, "#f4f7fb", "#0a0e16", 11, "c");
    }
  }

  /** Draw the race at `st.row`; `dt` the wall seconds since the last frame (−1 on a seek). */
  draw(st: StageState, dt: number): void {
    this.#st = st;
    const c = this.#ctx;
    const RM = st.reduced;
    c.setTransform(this.#DPR, 0, 0, this.#DPR, 0, 0);
    c.clearRect(0, 0, this.#W, this.#H);
    const her = this.#tr(st.focus);
    const fm = this.#posM(her);
    const fk = (speedAt(her, st.row) / 1000) * 3.6;
    const target = 0.34 + clamp((fk - 86) / 26, 0, 1) * 0.16;
    this.#anchor = dt < 0 ? target : this.#anchor + (target - this.#anchor) * Math.min(1, dt * 2.5);
    this.#camL = fm - this.#anchor * this.#SPAN;
    let sx = 0;
    let sy = 0;
    if (st.shake > 0 && !RM) {
      const q = st.shake / 0.15;
      sx = Math.sin(st.now * 90) * st.shakeAmp * q;
      sy = Math.cos(st.now * 77) * st.shakeAmp * q;
    }
    c.save();
    c.translate(sx, sy);
    this.#sky();
    this.#mesas(this.#gy - this.#H * 0.02, this.#camL * this.#ppm * 0.06, 1.1, "#4f2f44", 3);
    this.#mesas(this.#gy + 1, this.#camL * this.#ppm * 0.18, 0.9, "#6e3a37", 9);
    this.#bands();
    this.#track();
    const ph = phaseAt(her, st.row);
    // speed lines: the field's speed, and her dive
    if (!RM) {
      const extra = clamp(fk - 80, 0, 40);
      const nl = Math.round(4 + extra / 3.4);
      const len = Math.min(80, 8 + extra * 2);
      const diving = ph === PH.dive || ph === PH.surge;
      for (let k = 0; k < nl; k++) {
        const y = this.#H * (0.08 + 0.6 * hash(k * 1.31 + 0.7));
        const q = (st.now * (1.2 + extra / 18) + hash(k + 4)) % 1;
        const x = this.#W * (1.12 - q * 1.35);
        c.strokeStyle = diving
          ? `rgba(255,190,210,${0.16 + extra / 120})`
          : `rgba(255,255,255,${0.06 + extra / 300})`;
        c.lineWidth = diving ? 1.6 : 1.1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + len, y);
        c.stroke();
      }
    }
    const tracks = this.#m.tracks;
    const order = [...tracks].sort(
      (a, b) => this.#depth(b, this.#alt(b)) - this.#depth(a, this.#alt(a)) || a.lane - b.lane,
    );
    for (const t of order) this.#trail(t);
    for (const t of order) {
      const a = this.#alt(t);
      const x = this.#X(this.#posM(t));
      if (x < -60 || x > this.#W + 60) continue;
      c.fillStyle = `rgba(0,0,0,${clamp(0.38 - a * 0.07, 0.12, 0.38)})`;
      c.beginPath();
      c.ellipse(
        x + 6 * a,
        this.#feetY(t),
        Math.max(1, this.#figS(t) * (0.24 - a * 0.035)),
        this.#figS(t) * 0.04,
        0,
        0,
        TAU,
      );
      c.fill();
    }
    this.#effects(true);
    this.#airFight();
    const heads: Head[] = tracks.map(() => null);
    for (const t of order) {
      const x = this.#X(this.#posM(t));
      const a = this.#alt(t);
      if (x < -70 || x > this.#W + 70) continue;
      const P = POS_COLOR[this.#pos(t)];
      const mine = t.lane === st.focus;
      const col = {
        c1: mine ? P.c1 : this.#shade(P.c1, -0.28),
        c2: P.c2,
        glow: WING[this.#wing(t)].glow,
      };
      const hop = hopAt(t, st.row);
      let y = this.#yOf(t, a) - (RM || hop < 0 ? 0 : HOP_H * 4 * hop * (1 - hop) * this.#bandH);
      if (rowOf(t.dirty, st.row) && !RM) y += Math.sin(st.now * 48 + t.lane) * 1.6;
      if (mine) {
        c.strokeStyle = this.#hexA(P.c, 0.85);
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(x, this.#feetY(t) + 1, this.#figS(t) * 0.3, this.#figS(t) * 0.06, 0, 0, TAU);
        c.stroke();
        const hy = y - this.#figS(t) * 0.5;
        const g = c.createRadialGradient(x, hy, 0, x, hy, this.#figS(t) * 0.9);
        g.addColorStop(0, this.#hexA(P.c, 0.32));
        g.addColorStop(1, this.#hexA(P.c, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, hy, this.#figS(t) * 0.9, 0, TAU);
        c.fill();
      }
      c.globalAlpha = (mine ? 1 : 0.82) * (1 - 0.22 * this.#depth(t, a));
      heads[t.lane] = this.#fig(x, y, this.#figS(t), col, this.#pose(t, st.row));
      c.globalAlpha = 1;
    }
    this.#heads = heads;
    this.#effects(false);
    for (const t of order) {
      const h = heads[t.lane];
      if (!h || t.lane === st.focus) continue;
      const P = POS_COLOR[this.#pos(t)];
      c.font = FONT(800, 12);
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.fillStyle = this.#hexA(P.c, 0.95);
      c.fillText(`${P.glyph}${t.lane + 1}`, h.hx, h.hy - 12);
    }
    const hf = heads[st.focus] ?? null;
    this.#duel();
    this.#side();
    if (hf) {
      this.#ring(hf);
      this.#overlays(hf);
    }
    this.#inset();
    this.#offscreen();
    c.restore();
    if (!RM) {
      const dv = her.events.find(
        (e) => e.kind === "dive" && st.row >= e.tick && st.row - e.tick < 3,
      );
      if (dv) {
        c.fillStyle = `rgba(255,255,255,${0.22 * (1 - (st.row - dv.tick) / 3)})`;
        c.fillRect(0, 0, this.#W, this.#H);
      }
      if (ph === PH.dive && this.#alt(her) > 0.2) {
        const g = c.createRadialGradient(
          this.#W / 2,
          this.#H * 0.45,
          this.#H * 0.25,
          this.#W / 2,
          this.#H * 0.45,
          this.#H * 0.8,
        );
        g.addColorStop(0, "rgba(60,20,90,0)");
        g.addColorStop(1, "rgba(60,20,90,.38)");
        c.fillStyle = g;
        c.fillRect(0, 0, this.#W, this.#H);
      }
    }
    this.#ticker();
  }

  /** The nearest in her band and line ahead (≤ 30 m), for the dirty air and its bracket. */
  #aheadInLine(t: FlightTrack): { lane: number; gap: number } | null {
    const b = this.#band(t);
    if (b === 0) return null;
    const ln = rowOf(t.line, this.#st.row);
    const me = this.#posM(t);
    let best: { lane: number; gap: number } | null = null;
    for (const o of this.#m.tracks) {
      if (o.lane === t.lane || this.#band(o) !== b || rowOf(o.line, this.#st.row) !== ln) continue;
      const d = this.#posM(o) - me;
      if (d > 0 && d <= 30 && (best === null || d < best.gap)) best = { lane: o.lane, gap: d };
    }
    return best;
  }

  #duel() {
    const her = this.#tr(this.#st.focus);
    if (!rowOf(her.dirty, this.#st.row)) return;
    const ah = this.#aheadInLine(her);
    const h1 = this.#heads[her.lane];
    const h2 = ah && this.#heads[ah.lane];
    if (!ah || !h1 || !h2) return;
    const c = this.#ctx;
    const P = POS_COLOR[this.#pos(this.#tr(ah.lane))];
    const x = Math.max(h1.hx, h2.hx) + 26;
    const y1 = Math.min(h1.hy, h2.hy) - 4;
    const y2 = Math.max(h1.hy, h2.hy) + 30;
    c.strokeStyle = "rgba(255,180,90,.9)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 6, y1);
    c.lineTo(x, y1);
    c.lineTo(x, y2);
    c.lineTo(x - 6, y2);
    c.stroke();
    c.font = FONT(800, 11);
    const txt =
      ah.gap < 1.5
        ? this.#w.wingToWing
        : this.#w.gap((Math.round(ah.gap * 10) / 10).toFixed(1).replace(".", ","));
    const sub = this.#w.ahead(`${P.glyph}${ah.lane + 1}`);
    c.textAlign = "left";
    c.textBaseline = "middle";
    const yy = (y1 + y2) / 2;
    const w = Math.max(c.measureText(txt).width, c.measureText(sub).width) + 22;
    const x0 = Math.min(x + 4, this.#W - w - 4);
    c.fillStyle = "rgba(6,8,14,.8)";
    this.#rr(x0, yy - 16, w, 32, 6);
    c.fill();
    c.fillStyle = "#ffb340";
    c.fillText(txt, x0 + 6, yy - 6);
    c.fillStyle = P.c;
    c.fillText(sub, x0 + 6, yy + 7);
  }

  #side() {
    const her = this.#tr(this.#st.focus);
    const b = this.#band(her);
    const h1 = this.#heads[her.lane];
    if (b === 0 || !h1) return;
    const me = this.#posM(her);
    const ln = rowOf(her.line, this.#st.row);
    let o = -1;
    let best = 4;
    for (const t of this.#m.tracks) {
      if (t.lane === her.lane || !this.#heads[t.lane]) continue;
      if (this.#band(t) !== b || rowOf(t.line, this.#st.row) === ln) continue;
      const d = Math.abs(this.#posM(t) - me);
      if (d < best) {
        best = d;
        o = t.lane;
      }
    }
    const h2 = this.#heads[o];
    if (o < 0 || !h2) return;
    const c = this.#ctx;
    c.strokeStyle = "rgba(120,230,255,.75)";
    c.lineWidth = 2;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(h1.hx, h1.hy + 6);
    c.lineTo(h2.hx, h2.hy + 6);
    c.stroke();
    c.setLineDash([]);
    const txt = this.#w.sideBySide;
    c.font = FONT(800, 11);
    const w = c.measureText(txt).width + 12;
    const y = (h1.hy + h2.hy) / 2 + 14;
    let xl = Math.min(h1.hx, h2.hx) - 30 - w;
    if (xl < 96) xl = Math.min(this.#W - w - 4, Math.max(h1.hx, h2.hx) + 30);
    c.fillStyle = "rgba(6,8,14,.8)";
    this.#rr(xl, y - 9, w, 18, 6);
    c.fill();
    c.fillStyle = "#78e6ff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(txt, xl + w / 2, y + 0.5);
  }

  #inset() {
    const e = insetEvent(this.#log, this.#st.focus, this.#st.row);
    if (!e) return;
    const her = this.#tr(this.#st.focus);
    const b = this.#band(her) || ("band" in e ? e.band : 1) || 1;
    const c = this.#ctx;
    const W = this.#W;
    const w = Math.min(176, W * 0.46);
    const h = 86;
    // of four slots (top or middle, right or left) the one that covers the fewest runners
    const yMax = this.#gy - this.#S * 1.25 - h - 6;
    const ys = [TOP + 8, Math.min(yMax, Math.round((this.#LVL(2) + this.#LVL(1)) / 2 - h / 2))];
    const xs = [W - w - 8, 8];
    let x0 = xs[0] ?? 0;
    let y0 = ys[0] ?? 0;
    let bestN = 1e9;
    for (const yy of ys)
      for (const xx of xs) {
        let n = 0;
        this.#heads.forEach((hj, j) => {
          if (!hj) return;
          const top = hj.hy - 26;
          const bot = hj.hy + this.#S * 0.95;
          const l = hj.hx - this.#S * 0.45;
          const r = hj.hx + this.#S * 0.45;
          if (r > xx - 4 && l < xx + w + 4 && bot > yy - 4 && top < yy + h + 4)
            n += j === her.lane ? 3 : 1;
        });
        if (n < bestN) {
          bestN = n;
          x0 = xx;
          y0 = yy;
        }
      }
    const span = 24;
    const me = this.#posM(her);
    const XI = (m: number) => x0 + 10 + (w - 20) * clamp((m - me + span * 0.4) / span, 0, 1);
    c.fillStyle = "rgba(6,8,14,.84)";
    this.#rr(x0, y0, w, h, 10);
    c.fill();
    c.strokeStyle = "rgba(120,230,255,.45)";
    c.lineWidth = 1;
    this.#rr(x0 + 0.5, y0 + 0.5, w - 1, h - 1, 10);
    c.stroke();
    c.font = FONT(800, 11);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "#78e6ff";
    c.fillText(this.#w.inset(this.#w.bands[b] ?? ""), x0 + 8, y0 + 11);
    const yl = [y0 + h - 22, y0 + 40];
    for (let k = 0; k < 2; k++) {
      const yk = yl[k] ?? 0;
      c.fillStyle = "rgba(255,255,255,.06)";
      c.fillRect(x0 + 6, yk - 10, w - 12, 20);
      c.font = FONT(600, 9);
      c.fillStyle = "rgba(255,255,255,.45)";
      c.textAlign = "right";
      c.fillText(this.#w.linesUpper[k] ?? "", x0 + w - 8, yk - 9);
    }
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0 + 6, (yl[0] ?? 0) + 12);
    c.lineTo(x0 + w - 6, (yl[0] ?? 0) + 12);
    c.stroke();
    c.save();
    c.beginPath();
    c.rect(x0 + 2, y0 + 2, w - 4, h - 4);
    c.clip();
    for (const t of this.#m.tracks) {
      if (this.#band(t) !== b) continue;
      const m = this.#posM(t);
      if (m < me - span * 0.4 - 1 || m > me + span * 0.6 + 1) continue;
      const x = XI(m);
      const y = lerp(yl[0] ?? 0, yl[1] ?? 0, lineAt(t, this.#st.row));
      const P = POS_COLOR[this.#pos(t)];
      const mine = t.lane === her.lane;
      c.fillStyle = this.#hexA(P.c, 0.18);
      c.beginPath();
      c.moveTo(x - 5, y - 4);
      c.lineTo(x - 28, y - 7);
      c.lineTo(x - 28, y + 7);
      c.lineTo(x - 5, y + 4);
      c.closePath();
      c.fill();
      c.fillStyle = mine ? P.c : this.#hexA(P.c, 0.9);
      c.beginPath();
      c.moveTo(x + 7, y);
      c.lineTo(x - 5, y - 6);
      c.lineTo(x - 5, y + 6);
      c.closePath();
      c.fill();
      if (mine) {
        c.strokeStyle = "#fff";
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, 9, 0, TAU);
        c.stroke();
      }
      c.font = FONT(800, 10);
      c.textAlign = "center";
      c.fillStyle = "#fff";
      c.fillText(
        String(t.lane + 1),
        x + (mine ? 13 : 0),
        y + (mine ? 0 : y < y0 + h / 2 ? -12 : 12),
      );
    }
    c.restore();
  }

  #trail(t: FlightTrack) {
    const c = this.#ctx;
    const st = this.#st;
    const mine = t.lane === st.focus;
    const win = mine ? 90 : 36;
    const t0 = Math.max(0, st.row - win);
    let px: number | null = null;
    let py = 0;
    let pa = 0;
    c.lineCap = "round";
    for (let r = t0; r <= st.row + 0.001; r += 1) {
      const rr = Math.min(r, st.row);
      const a = this.#alt(t, rr);
      const x = this.#X(this.#posM(t, rr));
      const y = this.#yOf(t, a, rr) - this.#figS(t) * 0.42;
      const ph = phaseAt(t, rr);
      if (px !== null && (a > 0.02 || pa > 0.02) && ph !== PH.jump) {
        const age = (st.row - rr) / win;
        const al = (mine ? 0.85 : 0.45) * (1 - age);
        let col: string;
        let w: number;
        if (ph === PH.dive || ph === PH.falling) {
          col = `${ph === PH.dive ? "rgba(255,70,90," : "rgba(200,200,210,"}${al})`;
          w = mine ? 5 : 3;
        } else if (ph === PH.climb) {
          col = this.#hexA(STYLE_COLOR[t.style], al);
          w = mine ? 4.5 : 2.5;
        } else {
          col = `rgba(255,255,255,${al})`;
          w = mine ? 2.2 : 1.4;
        }
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.stroke();
        if (a > 2.9 && pa > 2.9) {
          c.strokeStyle = `rgba(235,240,255,${0.18 * (1 - age)})`;
          c.lineWidth = mine ? 9 : 6;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(x, y);
          c.stroke();
        }
      }
      px = x;
      py = y;
      pa = a;
    }
  }

  #effects(under: boolean) {
    const c = this.#ctx;
    const st = this.#st;
    for (const t of this.#m.tracks) {
      const mine = t.lane === st.focus;
      for (const e of t.events) {
        const dt = st.row - e.tick;
        if (dt < 0 || dt > 16) continue;
        const x = this.#X(e.posMm / 1000);
        if (x < -80 || x > this.#W + 80) continue;
        const q = dt / 16;
        const fy = this.#feetY(t);
        if (under && e.kind === "takeoff" && e.fromBand === 0) {
          const big = e.style === "lance" ? 1.5 : e.style === "turbine" ? 0.8 : 1;
          c.strokeStyle = `rgba(255,235,200,${0.7 * (1 - q)})`;
          c.lineWidth = 2.5 * (1 - q) + 0.5;
          c.beginPath();
          c.ellipse(x, fy, (10 + q * 40) * big, (3 + q * 7) * big, 0, 0, TAU);
          c.stroke();
          for (let k = 0; k < 7; k++) {
            const r = hash(k + e.tick);
            c.fillStyle = `rgba(210,160,110,${0.55 * (1 - q)})`;
            c.beginPath();
            c.arc(
              x - 10 - q * 30 * r - k * 3,
              fy - q * 14 * hash(k * 3 + e.tick),
              2 + q * 6 * r,
              0,
              TAU,
            );
            c.fill();
          }
        }
        if (under && e.kind === "dive") {
          const p = clamp(dt / 12, 0, 1);
          const g = e.gainMms / 7000;
          c.strokeStyle = `rgba(214,184,255,${0.9 * (1 - p)})`;
          c.lineWidth = 4 * (1 - p) + 1;
          c.beginPath();
          c.ellipse(
            x,
            fy,
            Math.max(1, (14 + p * 70) * g * (mine ? 1.2 : 0.8)),
            Math.max(1, (4 + p * 12) * g),
            0,
            0,
            TAU,
          );
          c.stroke();
          c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
          c.lineWidth = 2;
          c.beginPath();
          c.ellipse(x, fy, Math.max(1, (8 + p * 40) * g), Math.max(1, (2 + p * 8) * g), 0, 0, TAU);
          c.stroke();
          for (let k = 0; k < 12; k++) {
            const r = hash(k * 1.7 + e.tick);
            c.fillStyle = `rgba(225,175,120,${0.6 * (1 - p)})`;
            c.beginPath();
            c.arc(
              x - (k - 4) * 6 * g - p * 50 * r * g,
              fy - p * 30 * g * hash(k + e.tick * 3),
              2 + p * 7 * r,
              0,
              TAU,
            );
            c.fill();
          }
        }
        if (under && e.kind === "touchdown" && e.lossMms > 0) {
          const p = clamp(dt / 10, 0, 1);
          for (let k = 0; k < 6; k++) {
            const r = hash(k + e.tick);
            c.fillStyle = `rgba(150,140,140,${0.6 * (1 - p)})`;
            c.beginPath();
            c.arc(x - k * 5 - p * 18 * r, fy - p * 10 * r, 3 + p * 6 * r, 0, TAU);
            c.fill();
          }
        }
        if (under && e.kind === "landing") {
          const p = clamp(dt / 8, 0, 1);
          c.fillStyle = `rgba(225,175,120,${0.45 * (1 - p)})`;
          for (let k = 0; k < 4; k++) {
            c.beginPath();
            c.arc(x - k * 6 - p * 12, fy - p * 6, 2 + p * 4, 0, TAU);
            c.fill();
          }
        }
        if (under && e.kind === "waterHit") {
          const p = clamp(dt / 10, 0, 1);
          c.fillStyle = `rgba(200,235,255,${0.7 * (1 - p)})`;
          for (let k = 0; k < 8; k++) {
            const r = hash(k + e.tick);
            c.beginPath();
            c.arc(x - k * 4, fy - p * 24 * r, 1.5 + 2 * r, 0, TAU);
            c.fill();
          }
        }
        if (!under && e.kind === "bandReached" && dt <= 6) {
          const y = this.#yOf(t, e.band) - this.#figS(t) * 0.5;
          const p = dt / 6;
          const xx = this.#X(this.#posM(t));
          c.save();
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = this.#hexA(STYLE_COLOR[t.style], (mine ? 0.9 : 0.5) * (1 - p));
          c.lineWidth = mine ? 3 : 2;
          c.beginPath();
          c.arc(xx, y, (mine ? 10 : 6) + p * (mine ? 26 : 14), 0, TAU);
          c.stroke();
          c.restore();
        }
        if (!under && e.kind === "lineChange" && dt <= 14 && mine) {
          const xx = this.#X(this.#posM(t));
          const y = this.#yOf(t, this.#alt(t)) - this.#figS(t) * 1.25;
          const up = e.cause === "over";
          c.strokeStyle = up ? "#4be3a0" : "#ff5468";
          c.lineWidth = 3;
          for (let k = 0; k < 3; k++) {
            const yy = y + (up ? -1 : 1) * ((dt * 2 + k * 8) % 24);
            c.globalAlpha = 1 - dt / 14;
            c.beginPath();
            c.moveTo(xx - 9, yy + (up ? 6 : -6));
            c.lineTo(xx, yy);
            c.lineTo(xx + 9, yy + (up ? 6 : -6));
            c.stroke();
          }
          c.globalAlpha = 1;
        }
        if (!under && e.kind === "pass" && e.band >= 1 && dt <= 8) {
          const xx = this.#X(this.#posM(t));
          const y = this.#yOf(t, this.#alt(t)) - this.#figS(t) * 1.1;
          c.fillStyle = `rgba(53,224,255,${1 - dt / 8})`;
          c.beginPath();
          c.moveTo(xx + 12, y);
          c.lineTo(xx + 2, y - 6);
          c.lineTo(xx + 2, y + 6);
          c.closePath();
          c.fill();
        }
      }
    }
    // the ghost line of her next climb (the log's takeoff: where her gesture will take her)
    if (!under && !st.reduced) {
      const her = this.#tr(st.focus);
      const nx = her.events.find(
        (e) => e.kind === "takeoff" && e.tick > st.row && e.tick - st.row <= 15,
      );
      if (nx?.kind === "takeoff") {
        const v = speedAt(her, st.row) / 1000;
        const tks = nx.climbTicks * (nx.band - nx.fromBand);
        const x0 = this.#X(nx.posMm / 1000);
        const x1 = this.#X(nx.posMm / 1000 + (v * tks) / 15);
        const y0 = this.#yOf(her, nx.fromBand) - this.#figS(her) * 0.42;
        const y1 = this.#yOf(her, nx.band) - this.#figS(her) * 0.42;
        const q = 1 - (nx.tick - st.row) / 15;
        c.strokeStyle = this.#hexA(STYLE_COLOR[nx.style], 0.25 + 0.5 * q);
        c.lineWidth = 2;
        c.setLineDash([6, 6]);
        c.beginPath();
        c.moveTo(x0, y0);
        if (nx.style === "column") {
          const nb = nx.band - nx.fromBand;
          for (let b = 1; b <= nb; b++) {
            const yb = lerp(y0, y1, b / nb);
            c.lineTo(lerp(x0, x1, (b - 0.6) / nb), yb);
            c.lineTo(lerp(x0, x1, b / nb), yb);
          }
        } else c.lineTo(x1, y1);
        c.stroke();
        c.setLineDash([]);
        if (nx.style === "lance") {
          const xf = this.#X(this.#posM(her));
          c.save();
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = this.#hexA("#ff5a6e", 0.3 + 0.6 * q);
          c.lineWidth = 2 + 3 * q;
          c.beginPath();
          c.ellipse(xf, this.#feetY(her), 12 + 10 * q, 3 + 2 * q, 0, 0, TAU);
          c.stroke();
          c.restore();
        }
      }
    }
  }

  #airFight() {
    const c = this.#ctx;
    const st = this.#st;
    for (const t of this.#m.tracks) {
      const dirty = rowOf(t.dirty, st.row) !== 0;
      const tow = rowOf(t.drafting, st.row) !== 0 && this.#band(t) > 0;
      if (!dirty && !tow) continue;
      const ah = this.#aheadInLine(t);
      if (!ah) continue;
      const o = this.#tr(ah.lane);
      const xa = this.#X(this.#posM(o));
      const ya = this.#yOf(o, this.#alt(o)) - this.#figS(o) * 0.5;
      const xb = this.#X(this.#posM(t));
      const yb = this.#yOf(t, this.#alt(t)) - this.#figS(t) * 0.5;
      const mine = t.lane === st.focus;
      for (let k = -1; k <= 1; k += 2) {
        c.strokeStyle = dirty
          ? `rgba(255,180,90,${mine ? 0.75 : 0.4})`
          : `rgba(120,230,255,${mine ? 0.6 : 0.3})`;
        c.lineWidth = mine ? 1.8 : 1.2;
        c.beginPath();
        for (let s = 0; s <= 1.0001; s += 0.05) {
          const x = lerp(xa - 10, xb + 8, s);
          const y =
            lerp(ya, yb, s) +
            k * (4 + s * 6) +
            (dirty && !st.reduced ? Math.sin(s * 24 + st.now * 18) * 2 * s : 0);
          if (s === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    // Rasante a ras: dust (or spray over the liquid) under the frame's thrust
    for (const t of this.#m.tracks) {
      if (this.#wing(t) !== "ground") continue;
      const a = this.#alt(t);
      if (a < 0.15) continue;
      const x = this.#X(this.#posM(t));
      if (x < -60 || x > this.#W + 60) continue;
      const wet = this.#segAt(this.#posM(t)) === "water";
      const fy = this.#feetY(t);
      for (let k = 0; k < 9; k++) {
        const r = hash(k * 3.1 + t.lane);
        const q = ((st.reduced ? 0 : st.now * 2.2) + r) % 1;
        c.fillStyle = wet
          ? `rgba(200,235,255,${0.55 * (1 - q)})`
          : `rgba(220,170,120,${0.5 * (1 - q)})`;
        c.beginPath();
        c.arc(x - 8 - q * 46 - k * 2, fy - 2 - q * 10 * r * a, 2 + q * 6 * r, 0, TAU);
        c.fill();
      }
    }
  }

  /** Her dirty-air ring: fills while the run lasts (the next lineChange's `ticks` says when). */
  #ring(h: { hx: number; hy: number }) {
    const st = this.#st;
    const her = this.#tr(st.focus);
    let run = 0;
    for (let r = Math.floor(st.row); r >= 0 && run < 60; r--) {
      if (her.dirty[r]) run++;
      else break;
    }
    if (run < 2) return;
    const next = her.events.find((e) => e.kind === "lineChange" && e.tick >= st.row - 1);
    const goal =
      next?.kind === "lineChange" && next.tick - st.row < 60
        ? Math.max(next.ticks, 1)
        : Math.max(30, run);
    const q = clamp(run / goal, 0, 1);
    const c = this.#ctx;
    c.strokeStyle = "rgba(255,255,255,.18)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(h.hx, h.hy + 8, 18, 0, TAU);
    c.stroke();
    c.strokeStyle = q > 0.8 ? "#ff5468" : "#ffb340";
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(h.hx, h.hy + 8, 18, -PI / 2, -PI / 2 + TAU * q);
    c.stroke();
  }

  /** The banner and chip of the runner she follows, and her tag (the caption is the screen's). */
  #overlays(h: { hx: number; hy: number }) {
    const st = this.#st;
    const c = this.#ctx;
    const W = this.#W;
    const { banner, chip } = activeOverlays(st.overlays, st.row);
    const her = this.#tr(st.focus);
    const fm = positionAt(her, st.row);
    let chipText: string | null = null;
    let chipCol: [string, string] = ["#fff", "#0a0e16"];
    if (chip) {
      chipText = this.#w.overlay(chip);
      chipCol = overlayColor(chip);
    }
    // the countdown to her next takeoff (3 s before) beats every chip
    const nx = st.ahead.find((a) => a.tick > st.row && a.tick - st.row <= 45);
    if (nx) {
      chipText = this.#w.countdown(nx, Math.max(0, Math.round((nx.atMm - fm) / 1000)));
      chipCol =
        nx.event.kind === "noLift" ? ["#ff5468", "#fff"] : [STYLE_COLOR[nx.event.style], "#0a0e16"];
    }
    if (banner) {
      const age = st.row - banner.t0;
      const k = st.reduced ? 1 : clamp(age / 3, 0, 1);
      const y = TOP - 30;
      const text = this.#w.overlay(banner);
      const [bg, ink] = overlayColor(banner);
      if (banner.kind === "grand") {
        c.fillStyle = "rgba(0,0,0,.82)";
        c.fillRect(0, y - 24, W, 48);
        c.fillStyle = bg;
        c.fillRect(0, y - 24, W, 4);
        c.fillRect(0, y + 20, W, 4);
        c.font = FONT(800, 30);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = "#fff";
        c.globalAlpha = k;
        c.fillText(text, W / 2 + (1 - k) * 40, y + 1);
        c.globalAlpha = 1;
      } else {
        let size = 24;
        c.font = FONT(800, size);
        while (size > 15 && c.measureText(text).width + 34 > W - 16) {
          size -= 1;
          c.font = FONT(800, size);
        }
        const w = Math.min(W - 16, c.measureText(text).width + 34);
        c.globalAlpha = k;
        c.fillStyle = "rgba(6,8,14,.82)";
        this.#rr(W / 2 - w / 2, y - 19, w, 38, 10);
        c.fill();
        c.fillStyle = bg;
        this.#rr(W / 2 - w / 2, y - 19, 6, 38, 3);
        c.fill();
        c.fillStyle = bg;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, W / 2 + 3, y + 1);
        c.globalAlpha = 1;
        void ink;
      }
    }
    const P = POS_COLOR[this.#pos(her)];
    const minY = banner ? TOP + 10 : 50;
    let ly = h.hy - 22;
    let cy = ly - 27;
    let below = false;
    if (cy - 11 < minY) {
      below = true;
      const fy = this.#yOf(her, this.#alt(her)) + 14;
      ly = fy;
      cy = fy + 27;
    }
    this.#chip(h.hx, ly, this.#w.tag(her.lane), P.c, "#0a0e16", 12, "c");
    c.fillStyle = P.c;
    c.beginPath();
    if (below) {
      c.moveTo(h.hx - 5, ly - 10);
      c.lineTo(h.hx + 5, ly - 10);
      c.lineTo(h.hx, ly - 16);
    } else {
      c.moveTo(h.hx - 5, ly + 10);
      c.lineTo(h.hx + 5, ly + 10);
      c.lineTo(h.hx, ly + 16);
    }
    c.closePath();
    c.fill();
    if (chipText) this.#chip(h.hx, cy, chipText, chipCol[0], chipCol[1], 13, "c");
  }

  #offscreen() {
    const c = this.#ctx;
    const st = this.#st;
    const her = this.#tr(st.focus);
    const fm = this.#posM(her);
    const sides: {
      l: { i: number; y: number; d: number }[];
      r: { i: number; y: number; d: number }[];
    } = { l: [], r: [] };
    for (const t of this.#m.tracks) {
      if (t.lane === st.focus) continue;
      const x = this.#X(this.#posM(t));
      if (x >= -14 && x <= this.#W + 14) continue;
      const a = this.#alt(t);
      sides[x > this.#W ? "r" : "l"].push({
        i: t.lane,
        y: clamp(this.#yOf(t, a) - this.#figS(t) * 0.5, TOP + 6, this.#gy - 6),
        d: Math.round(this.#posM(t) - fm),
      });
    }
    for (const k of ["l", "r"] as const) {
      const L = sides[k];
      if (!L.length) continue;
      const right = k === "r";
      const xx = right ? this.#W - 6 : 6;
      L.sort((a, b) => a.y - b.y);
      for (let j = 1; j < L.length; j++) {
        const a = L[j - 1];
        const b = L[j];
        if (a && b && b.y - a.y < 16) b.y = a.y + 16;
      }
      const over = (L[L.length - 1]?.y ?? 0) - (this.#gy - 6);
      if (over > 0) for (const o of L) o.y -= over;
      for (const o of L) {
        const P = POS_COLOR[this.#pos(this.#tr(o.i))];
        const y = o.y;
        c.fillStyle = this.#hexA(P.c, 0.9);
        c.beginPath();
        if (right) {
          c.moveTo(xx, y);
          c.lineTo(xx - 8, y - 6);
          c.lineTo(xx - 8, y + 6);
        } else {
          c.moveTo(xx, y);
          c.lineTo(xx + 8, y - 6);
          c.lineTo(xx + 8, y + 6);
        }
        c.closePath();
        c.fill();
        const txt = `${P.glyph}${o.i + 1} ${o.d > 0 ? "+" : ""}${o.d} m`;
        c.font = FONT(700, 11);
        const w = c.measureText(txt).width + 8;
        c.fillStyle = "rgba(6,8,14,.6)";
        this.#rr(right ? xx - 11 - w : xx + 11, y - 8, w, 16, 5);
        c.fill();
        c.textAlign = right ? "right" : "left";
        c.textBaseline = "middle";
        c.fillStyle = "#fff";
        c.fillText(txt, right ? xx - 15 : xx + 15, y + 0.5);
      }
    }
  }

  /** The order of the field, bottom strip; dots for the band of each one in the air. */
  #ticker() {
    const c = this.#ctx;
    const st = this.#st;
    const ord = orderAt(this.#m, st.row);
    const y = this.#H - 16;
    const w = (this.#W - 16) / ord.length;
    c.fillStyle = "rgba(6,8,14,.9)";
    c.fillRect(0, this.#H - 30, this.#W, 30);
    ord.forEach((i, k) => {
      const t = this.#tr(i);
      const P = POS_COLOR[this.#pos(t)];
      const x = 8 + k * w;
      const b = this.#band(t);
      const mine = i === st.focus;
      c.fillStyle = mine ? P.c : "rgba(255,255,255,.08)";
      this.#rr(x + 1, y - 11, w - 2, 22, 6);
      c.fill();
      c.font = FONT(800, 13);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = mine ? "#0a0e16" : P.c;
      c.fillText(`${k + 1} ${P.glyph}${i + 1}`, x + w / 2, y + 1);
      if (b > 0) {
        c.fillStyle = mine ? "#0a0e16" : "#fff";
        for (let q = 0; q < b; q++) c.fillRect(x + 5 + q * 5, y - 9, 3, 3);
      }
    });
  }
}
