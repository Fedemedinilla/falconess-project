/**
 * The first-person view of a v3 race on a canvas (2026-11-10): the race from the eyes of the
 * runner the camera follows, only to feel the speed and the flight. The horizon and the dusk sky
 * of the side view, the track ahead with its features coming toward her (a Colina rising, a Bajada
 * falling away, Curvas bending, the pit of a Salto, Terreno líquido, the walls of a Pasillo, the
 * final's gate and the finish), the rivals ahead as figures scaled by distance on their line and
 * altitude, the horizon dropping as she climbs and rising as she dives, speed lines and a wider
 * field of view in a dive or a boost, a jolt on landing. Every number comes from the first-person
 * helpers of @falconess/race-view (the log only); every word from `StageWords`. Reduced motion
 * keeps the picture and drops the jolt, the field-of-view kick and the moving speed lines.
 */
import {
  curvatureAt,
  type FlightModel,
  FPV_BAND_M,
  FPV_TRACK_HALF_M,
  fpvCamera,
  fpvRivals,
  groundAt,
  groundProfile,
  FLIGHT_PHASE as PH,
} from "@falconess/race-view";
import type { Position, RaceGeometry, RaceLog, SegmentType, Style } from "@falconess/schema";
import { POS_COLOR, type StageWords } from "./stage";

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A stable pseudo-random number in [0, 1) for decoration, never for the race. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const FONT = (w: number, s: number) =>
  `${w} ${s}px "Barlow Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;

/** How far ahead she sees (m), the nearest slice, and the slices of the track. */
const FAR_M = 260;
const NEAR_M = 0.8;
const SLICES = 120;
/** Field of view (degrees) at rest and its kick in a dive. */
const FOV = 64;
const FOV_KICK = 26;
const WALL_M = 11;

/** The track's colors by segment: [road, road alternate, verge]. */
const ROAD: Record<SegmentType, [string, string, string]> = {
  flat: ["#9a5f3a", "#8d5634", "#5a3626"],
  curves: ["#93593a", "#865034", "#55332a"],
  water: ["#2f7fb8", "#2a70a4", "#284a5c"],
  jump: ["#a8693f", "#9a5f39", "#5a3626"],
  climb: ["#8f6038", "#835733", "#4f3524"],
  descent: ["#83502f", "#78492b", "#4a2f22"],
  canyon: ["#7a4a36", "#6f4331", "#3d2420"],
};
const WING_GLOW: Record<Style, string> = {
  dive: "#ff5a6e",
  hover: "#35e0ff",
  glide: "#e8f56a",
  ground: "#ffb13b",
};

export type FirstPersonState = {
  focus: number;
  row: number;
  /** Wall seconds, for decoration only. */
  now: number;
  reduced: boolean;
};

type Thing = { d: number; draw: () => void };

export class FirstPersonStage {
  readonly #cv: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #m: FlightModel;
  readonly #log: RaceLog;
  readonly #geo: RaceGeometry;
  readonly #w: StageWords;
  readonly #ground: Float32Array;
  /** The picture's heading (radians) at every metre, for the horizon's drift in the curves. */
  readonly #heading: Float32Array;
  #W = 360;
  #H = 470;
  #DPR = 1;
  #kick = 0;
  #pitch = 0;
  /** Per frame: lateral centre of the track at every metre ahead, and the slices. */
  readonly #xc = new Float32Array(FAR_M + 2);
  readonly #sd = new Float32Array(SLICES);
  readonly #sx = new Float32Array(SLICES);
  readonly #sy = new Float32Array(SLICES);
  readonly #sk = new Float32Array(SLICES);
  readonly #clip = new Float32Array(SLICES);
  #f = 300;
  #hy = 200;
  #camY = 0;
  #camX = 0;
  #pos = 0;
  #sprites: { lane: number; x: number; y: number; r: number }[] = [];

  constructor(cv: HTMLCanvasElement, log: RaceLog, model: FlightModel, words: StageWords) {
    const ctx = cv.getContext("2d");
    if (ctx === null) throw new Error("no 2d canvas");
    this.#cv = cv;
    this.#ctx = ctx;
    this.#m = model;
    this.#log = log;
    this.#geo = log.geometry;
    this.#w = words;
    this.#ground = groundProfile(log.geometry);
    const n = this.#ground.length;
    this.#heading = new Float32Array(n);
    let h = 0;
    for (let m = 1; m < n; m++) {
      h += curvatureAt(log.geometry, m - 0.5);
      this.#heading[m] = h;
    }
    this.layout();
  }

  /** The same box as the side view (a phone: as tall as 1.3 × its width, 450-560 px). */
  layout(): void {
    const r = this.#cv.getBoundingClientRect();
    this.#W = Math.max(280, r.width || this.#cv.parentElement?.clientWidth || 360);
    this.#H = Math.round(clamp(this.#W * 1.32, 450, 560));
    this.#DPR = Math.min(2, window.devicePixelRatio || 1);
    this.#cv.style.height = `${this.#H}px`;
    this.#cv.width = Math.round(this.#W * this.#DPR);
    this.#cv.height = Math.round(this.#H * this.#DPR);
  }

  /** The rival under a tap (within her figure, or 28 px), or −1. */
  laneAt(px: number, py: number): number {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const s of this.#sprites) {
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < Math.max(28, s.r) && d < bd) {
        bd = d;
        best = s.lane;
      }
    }
    return best;
  }

  // --- projection --------------------------------------------------------------------------------
  #groundAt(m: number): number {
    return groundAt(this.#ground, m) + this.#jumpShape(m);
  }
  /** A Salto: a lip that rises over 6 m, a pit, and the landing ramp back up. */
  #jumpShape(m: number): number {
    for (const s of this.#geo.segments) {
      if (s.type !== "jump") continue;
      const a = s.startMm / 1000;
      const b = s.endMm / 1000;
      if (m < a || m >= b) continue;
      if (m < a + 6) return (1.2 * (m - a)) / 6;
      if (m < b - 6) return -3;
      return -3 + (3 * (m - (b - 6))) / 6;
    }
    return 0;
  }
  #xcAt(d: number): number {
    const i = clamp(d, 0, FAR_M);
    const k = Math.floor(i);
    const a = this.#xc[k] ?? 0;
    const b = this.#xc[Math.min(FAR_M + 1, k + 1)] ?? a;
    return a + (b - a) * (i - k);
  }
  /** Screen point of (d ahead, lateral, height over the ground there); scale in px per m. */
  #P(d: number, lat: number, up: number): { x: number; y: number; s: number } {
    const s = this.#f / Math.max(NEAR_M, d);
    return {
      x: this.#W / 2 + (this.#xcAt(d) + lat - this.#camX) * s,
      y: this.#hy + (this.#camY - (this.#groundAt(this.#pos + d) + up)) * s,
      s,
    };
  }
  /** The crest's screen line at depth d: what nearer ground hides above it. */
  #clipAt(d: number): number {
    let y = Number.POSITIVE_INFINITY;
    for (let i = 0; i < SLICES && (this.#sd[i] ?? 0) < d - 0.5; i++) y = this.#clip[i] ?? y;
    return y;
  }

  // --- drawing ------------------------------------------------------------------------------------
  #hexA(hex: string, a: number) {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  #quad(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
  ) {
    const c = this.#ctx;
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.lineTo(cx, cy);
    c.lineTo(dx, dy);
    c.closePath();
    c.fill();
  }
  #chip(x: number, y: number, text: string, bg: string, fg: string, size: number) {
    const c = this.#ctx;
    c.font = FONT(800, size);
    const w = c.measureText(text).width + size * 0.9;
    const h = size * 1.5;
    c.fillStyle = bg;
    c.beginPath();
    c.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    c.fill();
    c.fillStyle = fg;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, x, y + 1);
  }

  /** Draw the race at `st.row` from the eyes of `st.focus`; `dt` wall seconds (−1 on a seek). */
  draw(st: FirstPersonState, dt: number): void {
    const c = this.#ctx;
    const W = this.#W;
    const H = this.#H;
    const RM = st.reduced;
    const cam = fpvCamera(this.#m, st.focus, st.row);
    const ease = dt < 0 ? 1 : Math.min(1, dt * 6);
    this.#kick += ((RM ? 0 : cam.fovKick) - this.#kick) * ease;
    this.#pitch += (cam.pitch - this.#pitch) * (dt < 0 ? 1 : Math.min(1, dt * 8));
    const fov = ((FOV + FOV_KICK * this.#kick) * Math.PI) / 180;
    this.#f = W / 2 / Math.tan(fov / 2);
    this.#hy = H * 0.42 + this.#pitch * H * 0.14;
    this.#pos = cam.posM;
    this.#camX = cam.lateralM;
    this.#camY = groundAt(this.#ground, cam.posM) + cam.eyeM;
    // the track's centre ahead, bending with the curves (her heading is the track's)
    let dx = 0;
    let x = 0;
    this.#xc[0] = 0;
    for (let d = 1; d <= FAR_M + 1; d++) {
      dx += curvatureAt(this.#geo, cam.posM + d - 0.5);
      x += dx;
      this.#xc[d] = x;
    }

    c.setTransform(this.#DPR, 0, 0, this.#DPR, 0, 0);
    let sx = 0;
    let sy = 0;
    if (!RM && cam.impact > 0) {
      const a = 9 * cam.impact;
      sx = Math.sin(st.now * 83) * a * 0.6;
      sy = Math.cos(st.now * 71) * a;
    }
    c.save();
    c.translate(sx, sy);
    this.#sky(cam.posM);
    this.#road(st);
    this.#things(st);
    c.restore();
    if (!RM) this.#speedLines(st, cam.speedFx, cam.phase === PH.dive || cam.phase === PH.surge);
    this.#wings(st, cam.alt, cam.phase);
    this.#vignette(st, cam.phase, cam.alt);
  }

  #sky(posM: number) {
    const c = this.#ctx;
    const W = this.#W;
    const H = this.#H;
    const hy = this.#hy;
    const g = c.createLinearGradient(0, hy - H * 0.75, 0, hy);
    g.addColorStop(0, "#0b1028");
    g.addColorStop(0.5, "#3a2a58");
    g.addColorStop(0.85, "#c4644a");
    g.addColorStop(1, "#eda463");
    c.fillStyle = g;
    c.fillRect(-20, -20, W + 40, hy + 21);
    // the sun drifts with her heading in the curves
    const head = this.#heading[clamp(Math.round(posM), 0, this.#heading.length - 1)] ?? 0;
    const sunX = W * 0.72 - head * W * 0.9;
    const sunY = hy - H * 0.06;
    const sg = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.42);
    sg.addColorStop(0, "rgba(255,230,170,.85)");
    sg.addColorStop(0.1, "rgba(255,200,120,.45)");
    sg.addColorStop(1, "rgba(255,160,90,0)");
    c.fillStyle = sg;
    c.fillRect(-20, -20, W + 40, hy + 20);
    this.#mesas(hy, head * W * 0.9 + posM * 0.05, 1.2, "#4f2f44", 3);
    this.#mesas(hy, head * W * 1.6 + posM * 0.16, 0.85, "#6e3a37", 9);
    // the plain below the horizon (the track draws over it)
    const pg = c.createLinearGradient(0, hy, 0, this.#H);
    pg.addColorStop(0, "#6e3a37");
    pg.addColorStop(0.25, "#4f2c24");
    pg.addColorStop(1, "#2d1a17");
    c.fillStyle = pg;
    c.fillRect(-20, hy, W + 40, this.#H - hy + 20);
  }
  #mesas(hz: number, off: number, scale: number, col: string, seed: number) {
    const c = this.#ctx;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(-20, hz + 1);
    const sp = 90 * scale;
    const k0 = Math.floor(off / sp) - 1;
    for (let k = k0; k < k0 + Math.ceil(this.#W / sp) + 3; k++) {
      const x = k * sp - off;
      const hg = (8 + hash(k * 1.7 + seed) * 26) * scale;
      const w = (30 + hash(k + seed * 3) * 50) * scale;
      c.lineTo(x, hz + 1);
      c.lineTo(x + 6 * scale, hz - hg);
      c.lineTo(x + w, hz - hg);
      c.lineTo(x + w + 6 * scale, hz + 1);
    }
    c.lineTo(this.#W + 20, hz + 1);
    c.closePath();
    c.fill();
  }

  #road(st: FirstPersonState) {
    const c = this.#ctx;
    const W = this.#W;
    const half = FPV_TRACK_HALF_M;
    const r = (FAR_M / NEAR_M) ** (1 / (SLICES - 1));
    let crest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < SLICES; i++) {
      const d = NEAR_M * r ** i;
      const p = this.#P(d, 0, 0);
      this.#sd[i] = d;
      this.#sx[i] = p.x;
      this.#sy[i] = p.y;
      this.#sk[i] = p.s;
      crest = Math.min(crest, p.y);
      this.#clip[i] = crest;
    }
    const finalM = this.#m.finalStartMm / 1000;
    const lengthM = this.#m.lengthMm / 1000;
    for (let i = SLICES - 1; i >= 1; i--) {
      const yf = this.#sy[i] ?? 0;
      const yn = this.#sy[i - 1] ?? 0;
      if (yf >= yn - 0.01) continue; // hidden behind a crest, or facing away
      const df = this.#sd[i] ?? 0;
      const dn = this.#sd[i - 1] ?? 0;
      const mMid = this.#pos + (df + dn) / 2;
      const seg = this.#segType(mMid);
      const [road, road2, verge] = ROAD[seg];
      const xf = this.#sx[i] ?? 0;
      const xn = this.#sx[i - 1] ?? 0;
      const kf = this.#sk[i] ?? 0;
      const kn = this.#sk[i - 1] ?? 0;
      const near = df < 90;
      const band4 = Math.floor(mMid / 4) % 2 === 0;
      const past = mMid > lengthM;
      // the verge, the full width
      c.fillStyle = near && Math.floor(mMid / 8) % 2 === 0 ? this.#shade(verge, 0.06) : verge;
      c.fillRect(-20, yf, W + 40, yn - yf + 0.6);
      // the road
      c.fillStyle = past ? "#4b4f58" : near && band4 ? road : road2;
      this.#quad(
        xf - half * kf,
        yf,
        xf + half * kf,
        yf,
        xn + half * kn,
        yn + 0.6,
        xn - half * kn,
        yn + 0.6,
      );
      if (seg === "water" && near) {
        const shimmer = st.reduced ? 0 : st.now * 2.2;
        c.fillStyle = `rgba(200,235,255,${0.18 + 0.12 * Math.sin(mMid * 0.9 + shimmer)})`;
        const lat = Math.sin(mMid * 0.37) * half * 0.6;
        this.#quad(
          xf + (lat - 0.8) * kf,
          yf,
          xf + (lat + 0.8) * kf,
          yf,
          xn + (lat + 0.8) * kn,
          yn,
          xn + (lat - 0.8) * kn,
          yn,
        );
      }
      // the kerbs: white, red and white in the curves
      const kerb = 0.35;
      c.fillStyle =
        seg === "curves"
          ? Math.floor(mMid / 3) % 2 === 0
            ? "#ff5468"
            : "#f4f7fb"
          : "rgba(244,247,251,.55)";
      for (const side of [-1, 1]) {
        const e0 = side * half;
        const e1 = side * (half - kerb);
        this.#quad(xf + e0 * kf, yf, xf + e1 * kf, yf, xn + e1 * kn, yn, xn + e0 * kn, yn);
      }
      // the two lines' divider, dashed
      if (near && Math.floor(mMid / 3) % 3 === 0 && seg !== "water") {
        c.fillStyle = "rgba(255,240,220,.35)";
        const w = 0.09;
        this.#quad(xf - w * kf, yf, xf + w * kf, yf, xn + w * kn, yn, xn - w * kn, yn);
      }
      // the final's line and the finish's checkers, across the road
      if (mMid >= finalM && mMid < finalM + 1.2) {
        c.fillStyle = "#ffc83d";
        this.#quad(xf - half * kf, yf, xf + half * kf, yf, xn + half * kn, yn, xn - half * kn, yn);
      }
      if (mMid >= lengthM - 1.5 && mMid < lengthM + 1.5) {
        const n = 10;
        for (let k = 0; k < n; k++) {
          const row = Math.floor((mMid - lengthM + 1.5) / 0.75);
          c.fillStyle = (k + row) % 2 === 0 ? "#f4f7fb" : "#11141c";
          const a = -half + (2 * half * k) / n;
          const b = a + (2 * half) / n;
          this.#quad(xf + a * kf, yf, xf + b * kf, yf, xn + b * kn, yn, xn + a * kn, yn);
        }
      }
      // a Pasillo's walls
      if (seg === "canyon") {
        const hf = WALL_M * kf;
        const hn = WALL_M * kn;
        const block = Math.floor(mMid / 7);
        for (const side of [-1, 1]) {
          const e = side * (half + 0.6);
          c.fillStyle =
            (block + (side > 0 ? 1 : 0)) % 2 === 0 ? "rgba(92,48,40,1)" : "rgba(80,40,34,1)";
          this.#quad(
            xf + e * kf,
            yf,
            xf + e * kf,
            yf - hf * (0.85 + 0.3 * hash(block * 3 + side)),
            xn + e * kn,
            yn - hn * (0.85 + 0.3 * hash(block * 3 + side)),
            xn + e * kn,
            yn,
          );
        }
      }
    }
  }
  #segType(m: number): SegmentType {
    const mm = m * 1000;
    for (const s of this.#geo.segments) if (mm >= s.startMm && mm < s.endMm) return s.type;
    return "flat";
  }
  #shade(hex: string, k: number) {
    const n = Number.parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(lerp(v, 255, k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /** Posts, the features' boards, the final's gate, the finish's arch and the rivals. */
  #things(st: FirstPersonState) {
    const c = this.#ctx;
    const things: Thing[] = [];
    const pos = this.#pos;
    const half = FPV_TRACK_HALF_M;
    const lengthM = this.#m.lengthMm / 1000;
    // edge posts every 10 m
    for (let m = Math.ceil((pos + 2) / 10) * 10; m < pos + 150 && m <= lengthM + 30; m += 10) {
      const d = m - pos;
      for (const side of [-1, 1])
        things.push({
          d,
          draw: () => {
            const b = this.#P(d, side * (half + 0.9), 0);
            const tp = this.#P(d, side * (half + 0.9), m % 50 === 0 ? 2.2 : 1.3);
            const w = Math.max(1, 0.18 * b.s);
            c.fillStyle = m % 50 === 0 ? "rgba(255,200,61,.9)" : "rgba(244,247,251,.75)";
            c.fillRect(b.x - w / 2, tp.y, w, b.y - tp.y);
          },
        });
    }
    // the boards of the features ahead
    for (const s of this.#geo.segments) {
      const d = s.startMm / 1000 - pos;
      if (s.type === "flat" || d < 3 || d > 170) continue;
      things.push({
        d,
        draw: () => {
          const p = this.#P(d, half + 2.4, 3.2);
          const b = this.#P(d, half + 2.4, 0);
          c.fillStyle = "rgba(244,247,251,.6)";
          c.fillRect(b.x - Math.max(1, 0.1 * b.s), p.y, Math.max(1.5, 0.2 * b.s), b.y - p.y);
          const size = clamp(p.s * 0.55, 8, 15);
          const text = s.type === "descent" ? this.#w.descent : this.#w.segment(s.type);
          this.#chip(p.x, p.y, text, "rgba(8,10,16,.8)", "#fff", size);
        },
      });
    }
    // the final's gate and the finish's arch
    const gates: [number, string, string, string][] = [
      [this.#m.finalStartMm / 1000, this.#w.final, "#ffc83d", "#1a1200"],
      [lengthM, this.#w.finishLine, "#f4f7fb", "#0a0e16"],
    ];
    for (const [gm, word, bg, fg] of gates) {
      const d = gm - pos;
      if (d < 1 || d > FAR_M - 10) continue;
      things.push({
        d,
        draw: () => {
          const top = 4 * FPV_BAND_M;
          const l0 = this.#P(d, -half - 0.8, 0);
          const l1 = this.#P(d, -half - 0.8, top);
          const r0 = this.#P(d, half + 0.8, 0);
          const r1 = this.#P(d, half + 0.8, top);
          const w = Math.max(1.5, 0.35 * l0.s);
          c.fillStyle = this.#hexA(bg, 0.9);
          c.fillRect(l1.x - w / 2, l1.y, w, l0.y - l1.y);
          c.fillRect(r1.x - w / 2, r1.y, w, r0.y - r1.y);
          c.fillRect(l1.x - w / 2, l1.y, r1.x - l1.x + w, w * 1.2);
          // the band marks on the posts: her altitude has a scale
          for (let k = 1; k <= 3; k++) {
            const q = this.#P(d, -half - 0.8, k * FPV_BAND_M);
            c.fillRect(q.x - w * 1.4, q.y - 0.5, w * 2.8, Math.max(1, w * 0.4));
            const q2 = this.#P(d, half + 0.8, k * FPV_BAND_M);
            c.fillRect(q2.x - w * 1.4, q2.y - 0.5, w * 2.8, Math.max(1, w * 0.4));
          }
          const size = clamp(l1.s * 0.9, 9, 22);
          this.#chip((l1.x + r1.x) / 2, l1.y + w * 0.6, word, bg, fg, size);
        },
      });
    }
    // the rivals ahead
    const sprites: { lane: number; x: number; y: number; r: number }[] = [];
    for (const rv of fpvRivals(this.#m, st.focus, st.row, FAR_M - 20))
      things.push({
        d: rv.aheadM,
        draw: () => {
          c.globalAlpha = rv.presence;
          const s = this.#figure(st, rv.lane, rv.aheadM, rv.lateralM, rv.alt, rv.phase);
          c.globalAlpha = 1;
          if (s && rv.presence > 0.5) sprites.push(s);
        },
      });
    things.sort((a, b) => b.d - a.d);
    for (const t of things) {
      if (t.d <= NEAR_M) continue;
      // hidden behind a crest: clip what is below the nearer ground's line
      const clip = this.#clipAt(t.d);
      const base = this.#P(t.d, 0, 0).y;
      if (base > clip + 1) {
        c.save();
        c.beginPath();
        c.rect(-20, -40, this.#W + 40, clip + 40);
        c.clip();
        t.draw();
        c.restore();
      } else t.draw();
    }
    this.#sprites = sprites;
  }

  /** A rival from behind: wings by her phase, body in her position's colors, her tag when near. */
  #figure(
    st: FirstPersonState,
    lane: number,
    d: number,
    lat: number,
    alt: number,
    phase: number,
  ): { lane: number; x: number; y: number; r: number } | null {
    const c = this.#ctx;
    const up = Math.max(0, alt) * FPV_BAND_M;
    const p = this.#P(d, lat, up + 0.9);
    const g = this.#P(d, lat, 0);
    const s = p.s;
    const pos: Position = this.#log.entries[lane]?.position ?? "pack";
    const P = POS_COLOR[pos];
    const glow = WING_GLOW[this.#log.entries[lane]?.style ?? "glide"];
    if (s * 1.4 < 2.2) {
      c.fillStyle = P.c;
      c.beginPath();
      c.arc(p.x, p.y, 1.4, 0, TAU);
      c.fill();
      return { lane, x: p.x, y: p.y, r: 10 };
    }
    // her shadow on the ground under her
    if (alt > 0.15) {
      c.fillStyle = `rgba(0,0,0,${clamp(0.32 - alt * 0.06, 0.1, 0.3)})`;
      c.beginPath();
      c.ellipse(g.x, g.y, Math.max(1, 0.9 * s), Math.max(0.5, 0.18 * s), 0, 0, TAU);
      c.fill();
    }
    const aloft = clamp(alt, 0, 1);
    const diving = phase === PH.dive || phase === PH.falling;
    const flap = st.reduced || phase !== PH.climb ? 0 : Math.sin(st.now * 14 + lane) * 0.25;
    const span = diving ? 0.55 : lerp(0.75, 1.7, aloft);
    const lift = diving ? 0.35 : lerp(0.05, 0.25, aloft) + flap;
    const sh = { x: p.x, y: p.y - 0.35 * s };
    for (const side of [-1, 1]) {
      c.fillStyle = this.#hexA(glow, 0.78);
      c.beginPath();
      c.moveTo(sh.x + side * 0.18 * s, sh.y);
      c.lineTo(sh.x + side * span * s, sh.y - lift * s);
      c.lineTo(sh.x + side * span * 0.82 * s, sh.y - (lift - 0.22) * s);
      c.lineTo(sh.x + side * 0.2 * s, sh.y + 0.42 * s);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(10,14,22,.55)";
      c.lineWidth = Math.max(0.6, 0.03 * s);
      c.stroke();
    }
    // body and head (from behind), a thruster glow at her back
    c.fillStyle = P.c1;
    c.beginPath();
    c.roundRect(p.x - 0.26 * s, p.y - 0.6 * s, 0.52 * s, 1.15 * s, 0.18 * s);
    c.fill();
    c.fillStyle = P.c2;
    c.fillRect(p.x - 0.26 * s, p.y - 0.6 * s, 0.52 * s, 0.12 * s);
    c.fillStyle = "#1b1420";
    c.beginPath();
    c.arc(p.x, p.y - 0.8 * s, 0.2 * s, 0, TAU);
    c.fill();
    const tg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 0.5 * s);
    tg.addColorStop(0, this.#hexA(glow, 0.55));
    tg.addColorStop(1, this.#hexA(glow, 0));
    c.fillStyle = tg;
    c.beginPath();
    c.arc(p.x, p.y, 0.5 * s, 0, TAU);
    c.fill();
    if (d < 70) {
      const size = clamp(s * 0.4, 10, 15);
      c.font = FONT(800, size);
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.fillStyle = this.#hexA(P.c, 0.95);
      c.fillText(`${P.glyph}${lane + 1}`, p.x, p.y - 1.05 * s - 2);
    }
    return { lane, x: p.x, y: p.y - 0.2 * s, r: Math.max(span, 0.9) * s };
  }

  /** Streaks out of the vanishing point: stronger with her speed, rose in a dive. */
  #speedLines(st: FirstPersonState, fx: number, diving: boolean) {
    if (fx <= 0.02) return;
    const c = this.#ctx;
    const cx = this.#W / 2;
    const cy = this.#hy;
    const R = Math.hypot(this.#W, this.#H) * 0.62;
    const n = Math.round(8 + 34 * fx);
    c.lineCap = "round";
    for (let k = 0; k < n; k++) {
      const a = hash(k * 2.13 + 0.4) * TAU;
      const q = (st.now * (0.9 + 2.4 * fx) + hash(k + 7.7)) % 1;
      const r0 = R * (0.18 + 0.82 * q * q);
      const len = R * (0.04 + 0.22 * fx) * (0.3 + q);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c.strokeStyle = diving
        ? `rgba(255,190,215,${(0.12 + 0.4 * fx) * q})`
        : `rgba(255,255,255,${(0.06 + 0.3 * fx) * q})`;
      c.lineWidth = (diving ? 2.2 : 1.4) * (0.5 + q);
      c.beginPath();
      c.moveTo(cx + ca * r0, cy + sa * r0);
      c.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
      c.stroke();
    }
    c.lineCap = "butt";
  }

  /** Her own wings at the edges of the view: spread up in the air, folded in a dive. */
  #wings(st: FirstPersonState, alt: number, phase: number) {
    const k = clamp(alt * 1.4, 0, 1);
    if (k <= 0.02) return;
    const c = this.#ctx;
    const W = this.#W;
    const H = this.#H;
    const lane = st.focus;
    const pos: Position = this.#log.entries[lane]?.position ?? "pack";
    const P = POS_COLOR[pos];
    const glow = WING_GLOW[this.#log.entries[lane]?.style ?? "glide"];
    const fold = phase === PH.dive || phase === PH.falling ? 0.45 : 1;
    const reach = W * 0.2 * k * fold;
    const y0 = H * 0.86;
    const tilt = this.#pitch * H * 0.03;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W;
      c.fillStyle = this.#hexA(P.c1, 0.92);
      c.beginPath();
      c.moveTo(x0, y0 - H * 0.12);
      c.lineTo(x0 - side * reach, y0 - H * 0.05 * fold + tilt);
      c.lineTo(x0 - side * reach * 0.7, y0 + H * 0.02);
      c.lineTo(x0, y0 + H * 0.08);
      c.closePath();
      c.fill();
      c.strokeStyle = this.#hexA(glow, 0.85);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0, y0 - H * 0.12);
      c.lineTo(x0 - side * reach, y0 - H * 0.05 * fold + tilt);
      c.stroke();
    }
  }

  /** The visor's frame, and the dive's dark edge and flash. */
  #vignette(st: FirstPersonState, phase: number, alt: number) {
    const c = this.#ctx;
    const W = this.#W;
    const H = this.#H;
    const top = c.createLinearGradient(0, 0, 0, H * 0.16);
    top.addColorStop(0, "rgba(4,6,12,.55)");
    top.addColorStop(1, "rgba(4,6,12,0)");
    c.fillStyle = top;
    c.fillRect(0, 0, W, H * 0.16);
    const bot = c.createLinearGradient(0, H * 0.78, 0, H);
    bot.addColorStop(0, "rgba(4,6,12,0)");
    bot.addColorStop(1, "rgba(4,6,12,.6)");
    c.fillStyle = bot;
    c.fillRect(0, H * 0.78, W, H * 0.22);
    if (st.reduced) return;
    if (phase === PH.dive && alt > 0.2) {
      const g = c.createRadialGradient(W / 2, this.#hy, H * 0.22, W / 2, this.#hy, H * 0.85);
      g.addColorStop(0, "rgba(60,20,90,0)");
      g.addColorStop(1, "rgba(60,20,90,.45)");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    const her = this.#m.tracks[st.focus];
    const dv = her?.events.find(
      (e) => e.kind === "dive" && st.row >= e.tick + 1 && st.row - e.tick - 1 < 3,
    );
    if (dv) {
      c.fillStyle = `rgba(255,255,255,${0.2 * (1 - (st.row - dv.tick - 1) / 3)})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
