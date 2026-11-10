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
  clipNear,
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
/** How far behind she sees when she turns her head (m), and the near plane of her eyes (m). */
const BACK_M = 90;
const EYE_NEAR = 0.3;
/** The verge reaches this far to each side of the track (m): the plain when she looks aside. */
const VERGE_M = 220;
const DEG = Math.PI / 180;
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
  /** Where the player turned her head, degrees (yaw + right, pitch + up); 0 looks down the track. */
  yaw?: number;
  lookPitch?: number;
};

/** Something standing on the track: its distance from her eyes (the drawing order) and where. */
type Thing = { k: number; d: number; lat: number; draw: () => void };
/** A strip of ground between two depths (m from her, negative behind), drawn far to near. */
type Strip = { a: number; b: number; key: number };
type Pt = { x: number; y: number; s: number; z: number };

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
  /** Per frame: lateral centre of the track at every metre ahead and behind. */
  readonly #xc = new Float32Array(FAR_M + 2);
  readonly #xb = new Float32Array(BACK_M + 2);
  /** The ground's strips, ahead and behind, the farthest first. */
  readonly #strips: Strip[];
  /** Her head's turn: cos and sin of the yaw, the yaw in radians. */
  #cy = 1;
  #syw = 0;
  #yaw = 0;
  /** How far lifting her eyes lowers the world (px). */
  #lookDrop = 0;
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
    const r = (FAR_M / NEAR_M) ** (1 / (SLICES - 1));
    const depths = [0];
    for (let d = NEAR_M; d <= FAR_M * 1.0001; d *= r) depths.push(d);
    const strips: Strip[] = [];
    for (let i = 1; i < depths.length; i++) {
      const a = depths[i - 1] ?? 0;
      const b = depths[i] ?? 0;
      strips.push({ a, b, key: b });
      if (b <= BACK_M) strips.push({ a: -b, b: -a, key: b + 1e-6 });
    }
    this.#strips = strips.sort((x, y) => y.key - x.key);
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
    const arr = d < 0 ? this.#xb : this.#xc;
    const top = d < 0 ? BACK_M : FAR_M;
    const i = clamp(Math.abs(d), 0, top);
    const k = Math.floor(i);
    const a = arr[k] ?? 0;
    const b = arr[Math.min(top + 1, k + 1)] ?? a;
    return a + (b - a) * (i - k);
  }
  /** Her eyes' frame of (d along the track, lateral, height over the ground): [x, y, z]. */
  #E(d: number, lat: number, up: number): [number, number, number] {
    const X = this.#xcAt(d) + lat - this.#camX;
    const Y = this.#groundAt(this.#pos + d) + up - this.#camY;
    return [X * this.#cy - d * this.#syw, Y, X * this.#syw + d * this.#cy];
  }
  /** Screen point of (d ahead, lateral, height over the ground there); scale in px per m, depth. */
  #P(d: number, lat: number, up: number): Pt {
    const [x, y, z] = this.#E(d, lat, up);
    const s = this.#f / Math.max(NEAR_M, z);
    return { x: this.#W / 2 + x * s, y: this.#hy - y * s, s, z };
  }
  /** Fill a polygon of track points [d, lateral, up], cut where it passes behind her eyes. */
  #poly(pts: readonly (readonly [number, number, number])[]) {
    const cam = pts.map(([d, l, u]) => this.#E(d, l, u));
    const cut = clipNear(cam, EYE_NEAR);
    if (cut.length < 3) return;
    const c = this.#ctx;
    const cx = this.#W / 2;
    c.beginPath();
    for (let i = 0; i < cut.length; i++) {
      const q = cut[i];
      if (q === undefined) continue;
      const s = this.#f / q[2];
      const x = cx + q[0] * s;
      const y = this.#hy - q[1] * s;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
  }
  /** A flat band across the track between depths a and b, from lateral l0 to l1. */
  #band(a: number, b: number, l0: number, l1: number) {
    this.#poly([
      [a, l0, 0],
      [a, l1, 0],
      [b, l1, 0],
      [b, l0, 0],
    ]);
  }
  /**
   * The screen line above which a thing at (d, lat) shows: nearer ground (a crest, a Salto's lip)
   * hides what is under the sight line from her eyes over it; +∞ when nothing hides it.
   */
  #crestY(d: number, lat: number): number {
    if (Math.abs(d) < 4) return Number.POSITIVE_INFINITY;
    const g = this.#groundAt(this.#pos + d);
    let need = Number.NEGATIVE_INFINITY;
    for (let k = 1; k < 20; k++) {
      const t = k / 20;
      need = Math.max(need, this.#camY + (this.#groundAt(this.#pos + t * d) - this.#camY) / t);
    }
    if (need <= g + 0.05) return Number.POSITIVE_INFINITY;
    return this.#P(d, lat, need - g).y;
  }

  // --- drawing ------------------------------------------------------------------------------------
  #hexA(hex: string, a: number) {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
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
    this.#yaw = (st.yaw ?? 0) * DEG;
    this.#cy = Math.cos(this.#yaw);
    this.#syw = Math.sin(this.#yaw);
    // her eyes lifted (+) or lowered: the horizon goes down or up
    const look = (st.lookPitch ?? 0) * DEG;
    this.#lookDrop = Math.tan(look) * this.#f;
    this.#hy = H * 0.42 + this.#pitch * H * 0.14 + this.#lookDrop;
    this.#pos = cam.posM;
    this.#camX = cam.lateralM;
    this.#camY = groundAt(this.#ground, cam.posM) + cam.eyeM;
    // the track's centre ahead and behind, bending with the curves (her heading is the track's)
    let dx = 0;
    let x = 0;
    this.#xc[0] = 0;
    for (let d = 1; d <= FAR_M + 1; d++) {
      dx += curvatureAt(this.#geo, cam.posM + d - 0.5);
      x += dx;
      this.#xc[d] = x;
    }
    dx = 0;
    x = 0;
    this.#xb[0] = 0;
    for (let d = 1; d <= BACK_M + 1; d++) {
      dx += curvatureAt(this.#geo, cam.posM - d + 0.5);
      x += dx;
      this.#xb[d] = x;
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
    // the speed lines stream from ahead: they fade as she looks aside
    const ahead = Math.max(0, Math.cos(this.#yaw));
    if (!RM && ahead > 0.25)
      this.#speedLines(st, cam.speedFx * ahead, cam.phase === PH.dive || cam.phase === PH.surge);
    this.#wings(st, cam.alt, cam.phase);
    this.#vignette(st, cam.phase, cam.alt);
    this.#compass(st.yaw ?? 0);
  }

  /** A small arc at the top: where her head points within her neck's reach; gone when ahead. */
  #compass(yawDeg: number) {
    const a = clamp((Math.abs(yawDeg) - 3) / 9, 0, 1);
    if (a <= 0) return;
    const c = this.#ctx;
    const cx = this.#W / 2;
    const cy = 64;
    const r = 15;
    const up = -Math.PI / 2;
    const reach = 110 * DEG;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = "rgba(6,8,14,.72)";
    c.beginPath();
    c.arc(cx, cy, r + 7, 0, TAU);
    c.fill();
    c.lineCap = "round";
    c.lineWidth = 2;
    c.strokeStyle = "rgba(244,247,251,.35)";
    c.beginPath();
    c.arc(cx, cy, r, up - reach, up + reach);
    c.stroke();
    // the track ahead
    c.fillStyle = "#ffc83d";
    c.beginPath();
    c.arc(cx, cy - r, 2.2, 0, TAU);
    c.fill();
    // her look: a wedge from the centre
    const t = up + yawDeg * DEG;
    c.fillStyle = "#f4f7fb";
    c.beginPath();
    c.moveTo(cx + Math.cos(t) * (r + 3), cy + Math.sin(t) * (r + 3));
    c.lineTo(cx + Math.cos(t + 0.5) * 5, cy + Math.sin(t + 0.5) * 5);
    c.lineTo(cx + Math.cos(t - 0.5) * 5, cy + Math.sin(t - 0.5) * 5);
    c.closePath();
    c.fill();
    c.restore();
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
    const pan = this.#yaw * this.#f;
    const sunX = W * 0.72 - head * W * 0.9 - pan;
    const sunY = hy - H * 0.06;
    const sg = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.42);
    sg.addColorStop(0, "rgba(255,230,170,.85)");
    sg.addColorStop(0.1, "rgba(255,200,120,.45)");
    sg.addColorStop(1, "rgba(255,160,90,0)");
    c.fillStyle = sg;
    c.fillRect(-20, -20, W + 40, hy + 20);
    this.#mesas(hy, head * W * 0.9 + posM * 0.05 + pan, 1.2, "#4f2f44", 3);
    this.#mesas(hy, head * W * 1.6 + posM * 0.16 + pan, 0.85, "#6e3a37", 9);
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
    const half = FPV_TRACK_HALF_M;
    const finalM = this.#m.finalStartMm / 1000;
    const lengthM = this.#m.lengthMm / 1000;
    // the ground behind her shows only when she turns her head far enough
    const halfFov = Math.atan(this.#W / 2 / this.#f);
    const back = Math.abs(this.#yaw) + halfFov > 85 * DEG;
    for (const sp of this.#strips) {
      if (sp.a < 0 && !back) continue;
      const behind = sp.b <= 0;
      // a hair of overlap on the near side hides the seams
      const ov = (sp.b - sp.a) * 0.2;
      const a = behind ? sp.a : sp.a - ov;
      const b = behind ? sp.b + ov : sp.b;
      const mMid = this.#pos + (sp.a + sp.b) / 2;
      const seg = this.#segType(mMid);
      const [road, road2, verge] = ROAD[seg];
      const dist = Math.max(Math.abs(sp.a), Math.abs(sp.b));
      const near = dist < 90;
      const band4 = Math.floor(mMid / 4) % 2 === 0;
      const past = mMid > lengthM;
      // the verge, out to the plain
      c.fillStyle = near && Math.floor(mMid / 8) % 2 === 0 ? this.#shade(verge, 0.06) : verge;
      this.#band(a, b, -VERGE_M, VERGE_M);
      // the road
      c.fillStyle = past ? "#4b4f58" : near && band4 ? road : road2;
      this.#band(a, b, -half, half);
      if (seg === "water" && near) {
        const shimmer = st.reduced ? 0 : st.now * 2.2;
        c.fillStyle = `rgba(200,235,255,${0.18 + 0.12 * Math.sin(mMid * 0.9 + shimmer)})`;
        const lat = Math.sin(mMid * 0.37) * half * 0.6;
        this.#band(sp.a, sp.b, lat - 0.8, lat + 0.8);
      }
      // the kerbs: white, red and white in the curves
      const kerb = 0.35;
      c.fillStyle =
        seg === "curves"
          ? Math.floor(mMid / 3) % 2 === 0
            ? "#ff5468"
            : "#f4f7fb"
          : "rgba(244,247,251,.55)";
      for (const side of [-1, 1]) this.#band(sp.a, sp.b, side * half, side * (half - kerb));
      // the two lines' divider, dashed
      if (near && Math.floor(mMid / 3) % 3 === 0 && seg !== "water") {
        c.fillStyle = "rgba(255,240,220,.35)";
        this.#band(sp.a, sp.b, -0.09, 0.09);
      }
      // the final's line and the finish's checkers, across the road
      if (mMid >= finalM && mMid < finalM + 1.2) {
        c.fillStyle = "#ffc83d";
        this.#band(sp.a, sp.b, -half, half);
      }
      if (mMid >= lengthM - 1.5 && mMid < lengthM + 1.5) {
        const n = 10;
        const row = Math.floor((mMid - lengthM + 1.5) / 0.75);
        for (let k = 0; k < n; k++) {
          c.fillStyle = (k + row) % 2 === 0 ? "#f4f7fb" : "#11141c";
          const l0 = -half + (2 * half * k) / n;
          this.#band(sp.a, sp.b, l0, l0 + (2 * half) / n);
        }
      }
      // a Pasillo's walls
      if (seg === "canyon") {
        const block = Math.floor(mMid / 7);
        for (const side of [-1, 1]) {
          const e = side * (half + 0.6);
          const h = WALL_M * (0.85 + 0.3 * hash(block * 3 + side));
          c.fillStyle =
            (block + (side > 0 ? 1 : 0)) % 2 === 0 ? "rgba(92,48,40,1)" : "rgba(80,40,34,1)";
          this.#poly([
            [sp.a, e, 0],
            [sp.a, e, h],
            [sp.b, e, h],
            [sp.b, e, 0],
          ]);
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
    const look = Math.abs(this.#yaw) > 0.05;
    const add = (d: number, lat: number, draw: () => void) =>
      things.push({ k: Math.hypot(d, lat - this.#camX), d, lat, draw });
    // edge posts every 10 m (behind her too when she looks around)
    const from = look ? Math.max(0, pos - BACK_M) : pos + 2;
    for (let m = Math.ceil(from / 10) * 10; m < pos + 150 && m <= lengthM + 30; m += 10) {
      const d = m - pos;
      for (const side of [-1, 1]) {
        const lat = side * (half + 0.9);
        add(d, lat, () => {
          const b = this.#P(d, lat, 0);
          const tp = this.#P(d, lat, m % 50 === 0 ? 2.2 : 1.3);
          if (b.z < NEAR_M) return;
          const w = Math.max(1, 0.18 * b.s);
          c.fillStyle = m % 50 === 0 ? "rgba(255,200,61,.9)" : "rgba(244,247,251,.75)";
          c.fillRect(b.x - w / 2, tp.y, w, b.y - tp.y);
        });
      }
    }
    // the boards of the features ahead (and the ones she passed, when she looks back)
    for (const s of this.#geo.segments) {
      const d = s.startMm / 1000 - pos;
      if (s.type === "flat" || d > 170 || d < (look ? -BACK_M : 3)) continue;
      const lat = half + 2.4;
      add(d, lat, () => {
        const p = this.#P(d, lat, 3.2);
        const b = this.#P(d, lat, 0);
        if (b.z < 2) return;
        c.fillStyle = "rgba(244,247,251,.6)";
        c.fillRect(b.x - Math.max(1, 0.1 * b.s), p.y, Math.max(1.5, 0.2 * b.s), b.y - p.y);
        const size = clamp(p.s * 0.55, 8, 15);
        const text = s.type === "descent" ? this.#w.descent : this.#w.segment(s.type);
        this.#chip(p.x, p.y, text, "rgba(8,10,16,.8)", "#fff", size);
      });
    }
    // the final's gate and the finish's arch
    const gates: [number, string, string, string][] = [
      [this.#m.finalStartMm / 1000, this.#w.final, "#ffc83d", "#1a1200"],
      [lengthM, this.#w.finishLine, "#f4f7fb", "#0a0e16"],
    ];
    for (const [gm, word, bg, fg] of gates) {
      const d = gm - pos;
      if (d > FAR_M - 10 || d < (look ? -BACK_M : 1)) continue;
      add(d, 0, () => {
        const top = 4 * FPV_BAND_M;
        const l0 = this.#P(d, -half - 0.8, 0);
        const l1 = this.#P(d, -half - 0.8, top);
        const r0 = this.#P(d, half + 0.8, 0);
        const r1 = this.#P(d, half + 0.8, top);
        c.fillStyle = this.#hexA(bg, 0.9);
        // each post on its own (one may be behind her eyes), the bar and the word with both
        for (const [p0, p1, lat] of [
          [l0, l1, -half - 0.8],
          [r0, r1, half + 0.8],
        ] as const) {
          if (p0.z < NEAR_M) continue;
          const w = Math.max(1.5, 0.35 * p0.s);
          c.fillRect(p1.x - w / 2, p1.y, w, p0.y - p1.y);
          // the band marks on the posts: her altitude has a scale
          for (let k = 1; k <= 3; k++) {
            const q = this.#P(d, lat, k * FPV_BAND_M);
            c.fillRect(q.x - w * 1.4, q.y - 0.5, w * 2.8, Math.max(1, w * 0.4));
          }
        }
        if (l0.z < NEAR_M || r0.z < NEAR_M) return;
        const w = Math.max(1.5, 0.35 * Math.min(l0.s, r0.s));
        c.beginPath();
        c.moveTo(l1.x, l1.y);
        c.lineTo(r1.x, r1.y);
        c.lineTo(r1.x, r1.y + w * 1.2);
        c.lineTo(l1.x, l1.y + w * 1.2);
        c.closePath();
        c.fill();
        const size = clamp(Math.min(l1.s, r1.s) * 0.9, 9, 22);
        this.#chip((l1.x + r1.x) / 2, (l1.y + r1.y) / 2 + w * 0.6, word, bg, fg, size);
      });
    }
    // the rivals ahead (beside and behind her too when she looks around)
    const sprites: { lane: number; x: number; y: number; r: number }[] = [];
    for (const rv of fpvRivals(this.#m, st.focus, st.row, FAR_M - 20, look ? BACK_M - 10 : 0))
      add(rv.aheadM, rv.lateralM, () => {
        c.globalAlpha = rv.presence;
        const s = this.#figure(st, rv.lane, rv.aheadM, rv.lateralM, rv.alt, rv.phase);
        c.globalAlpha = 1;
        if (s && rv.presence > 0.5) sprites.push(s);
      });
    things.sort((a, b) => b.k - a.k);
    for (const t of things) {
      if (t.k <= NEAR_M) continue;
      // hidden behind a crest or a Salto's lip: clip what is under the sight line over it
      const clip = this.#crestY(t.d, t.lat);
      if (clip < this.#H + 40) {
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
    // a rival right beside her eyes fades out rather than fill the view
    const close = clamp((p.z - 2.5) / 3, 0, 1);
    if (close <= 0) return null;
    c.globalAlpha *= close;
    const g = this.#P(d, lat, 0);
    const s = p.s;
    // her wings foreshorten as she is seen from the side (she runs along the track)
    const side = clamp(Math.abs(this.#cy), 0.22, 1);
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
    const span = (diving ? 0.55 : lerp(0.75, 1.7, aloft)) * side;
    const lift = diving ? 0.35 : lerp(0.05, 0.25, aloft) + flap;
    const sh = { x: p.x, y: p.y - 0.35 * s };
    for (const wing of [-1, 1]) {
      c.fillStyle = this.#hexA(glow, 0.78);
      c.beginPath();
      c.moveTo(sh.x + wing * 0.18 * s, sh.y);
      c.lineTo(sh.x + wing * span * s, sh.y - lift * s);
      c.lineTo(sh.x + wing * span * 0.82 * s, sh.y - (lift - 0.22) * s);
      c.lineTo(sh.x + wing * 0.2 * s, sh.y + 0.42 * s);
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
    const tilt = this.#pitch * H * 0.03;
    // she turns her head: the wing on that side fills more of its edge (she looks along it), the
    // other one slides out of view; lifting her eyes lowers both
    const turn = Math.sin(this.#yaw);
    const y0 = H * 0.86 + this.#lookDrop;
    for (const side of [-1, 1]) {
      const along = side * turn;
      const grow = along > 0 ? 1 + 0.9 * along : Math.max(0, 1 + 1.3 * along);
      if (grow <= 0.05) continue;
      const x0 = side < 0 ? 0 : W;
      const reach = W * 0.2 * k * fold * grow;
      const rise = H * 0.04 * Math.max(0, along);
      c.fillStyle = this.#hexA(P.c1, 0.92);
      c.beginPath();
      c.moveTo(x0, y0 - H * 0.12 - rise);
      c.lineTo(x0 - side * reach, y0 - H * 0.05 * fold + tilt - rise);
      c.lineTo(x0 - side * reach * 0.7, y0 + H * 0.02);
      c.lineTo(x0, y0 + H * 0.08);
      c.closePath();
      c.fill();
      c.strokeStyle = this.#hexA(glow, 0.85);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0, y0 - H * 0.12 - rise);
      c.lineTo(x0 - side * reach, y0 - H * 0.05 * fold + tilt - rise);
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
