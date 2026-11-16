/**
 * The season walks' invariants I1–I22 (plan §3.4): what must hold over a walk's trace (`world.ts`),
 * whatever the bot did. Each is declared with what it needs of the policy: always asserted for the
 * target policy, and for the active one only once its flag flipped (`requires`). "Per mount" means
 * between two reloads; counts are of completions (a beat a command ended), not of tops.
 */
import type { SeasonState, StoryScene } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { expect, it } from "vitest";
import { withPosition } from "../../../screens/model/position";
import { triggerHolds } from "../../storyModel";
import { weekFx } from "../../weekFx";
import { isInstant } from "../beats";
import { type FlowPolicy, TARGET_POLICY } from "../policy";
import { addedRace } from "../steps";
import type { Beat } from "../types";
import { trainingOutcome } from "../week";
import { MAX_MOVES, runWalk, type WalkEnd, type WalkSpec } from "./bots";
import type { TraceEvent } from "./world";

/** A world's whole trace: one or more seasons a bot played. */
export type Walk = {
  readonly name: string;
  readonly policy: FlowPolicy;
  readonly pace: "normal" | "fast" | "direct";
  readonly reduced: boolean;
  readonly ctx: SimContext;
  readonly trace: readonly TraceEvent[];
  readonly ends: readonly WalkEnd[];
};

export type Invariant = {
  readonly id: string;
  readonly name: string;
  /** Whether the policy has what the invariant needs (the plan's "ACTIVE from" column). */
  readonly requires: (p: FlowPolicy) => boolean;
  /** Every place the walk breaks it, described (empty: it holds). */
  readonly check: (w: Walk) => readonly string[];
};

function invariant(
  id: string,
  name: string,
  requires: (p: FlowPolicy) => boolean,
  check: (w: Walk) => readonly string[],
): Invariant {
  return { id, name, requires, check };
}

type Ev<T extends TraceEvent["type"]> = Extract<TraceEvent, { type: T }>;
type Done = Ev<"done">;

const always = (): boolean => true;
const where = (e: TraceEvent): string =>
  `season ${e.at.season}, mount ${e.at.mount}, move ${e.at.move}`;

/** A beat, short. */
export function label(b: Beat): string {
  switch (b.kind) {
    case "fx":
      return `fx:${b.part}:${b.fx.map((x) => x.kind).join("+")}`;
    case "scene":
      return `scene:${b.scene.id}@${b.where}`;
    case "pass":
      return `pass:${b.scene.id}`;
    case "inspiration":
      return `card:${b.card.key}`;
    default:
      return `${b.kind}:${b.key}`;
  }
}

/** The trace cut by season or by mount, in order. */
function groups(trace: readonly TraceEvent[], by: "season" | "mount"): TraceEvent[][] {
  const out = new Map<number, TraceEvent[]>();
  for (const e of trace) {
    const list = out.get(e.at[by]) ?? [];
    list.push(e);
    out.set(e.at[by], list);
  }
  return [...out.values()];
}

function of<T extends TraceEvent["type"]>(events: readonly TraceEvent[], type: T): Ev<T>[] {
  return events.filter((e): e is Ev<T> => e.type === type);
}

/** The beat on screen (instant beats resolve before paint) and the one after it. */
function shownOf(beats: readonly Beat[]): [Beat | undefined, Beat | undefined] {
  const real = beats.filter((b) => !isInstant(b));
  return [real[0], real[1]];
}

/** The part of a beat key after its fingerprint: `w:fx`, `race:replay`, `fx`, `ack`… */
function tail(key: string): string | undefined {
  const i = key.lastIndexOf("/");
  return i < 0 ? undefined : key.slice(i + 1);
}

const fpOfKey = (key: string): string => key.slice(0, key.lastIndexOf("/"));

function sceneOf(b: Beat): StoryScene | undefined {
  return b.kind === "scene" || b.kind === "pass" ? b.scene : undefined;
}

const sorted = (items: readonly string[]): string => [...items].sort().join(" ");

/** The index of the last item that passes, or −1 (`findLastIndex` is ES2023). */
function lastIndex<T>(items: readonly T[], pass: (item: T, i: number) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item !== undefined && pass(item, i)) return i;
  }
  return -1;
}

// --- I1 -----------------------------------------------------------------------------------------

/** A race week's completions, in their only order (scenes before «Correr» at 3, after it at 7). */
const RACE_ORDER: Readonly<Record<string, number>> = {
  "w:result": 0,
  "w:fx": 1,
  "w:emblem": 2,
  "w:enter": 2,
  "w:position": 4,
  "race:replay": 5,
  "race:finish": 6,
  "race:result": 8,
};
const PRE = 3;
const POST = 7;
const END = 8;

const I1 = invariant(
  "I1",
  "modes never mix: a race week completes train-result? fx:action? (emblem|enter) scene* position replay? finish? scene* race-result, nothing else",
  always,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      let at: number | undefined;
      for (const e of of(mount, "done")) {
        const k = e.beat.key;
        if (k.startsWith("watch:")) continue; // legacy's emblem over a watch: no race week
        const t = tail(k);
        const fixed = t === undefined ? undefined : RACE_ORDER[t];
        const sc = sceneOf(e.beat);
        let next: number;
        if (fixed !== undefined) next = fixed;
        else if (sc && (at !== undefined || e.flow.mode === "race")) {
          const kind = sc.trigger.kind;
          // before «Correr» while the week has not reached it (a reload may start mid-week)
          const early = at === undefined ? kind === "goal-before" : at <= PRE;
          next = early ? PRE : POST;
          const fits =
            next === PRE
              ? kind === "goal-before"
              : kind !== "goal-before" &&
                (!w.policy.sceneFilters || kind === "goal-after" || kind === "end");
          if (!fits) out.push(`${where(e)}: ${label(e.beat)} (${kind}) inside a race week`);
        } else {
          if (at !== undefined) out.push(`${where(e)}: ${label(e.beat)} inside a race week`);
          continue;
        }
        if (at !== undefined && (next < at || (next === at && next !== PRE && next !== POST)))
          out.push(`${where(e)}: ${label(e.beat)} out of order in a race week`);
        at = next === END ? undefined : next;
      }
    }
    return out;
  },
);

// --- I2 -----------------------------------------------------------------------------------------

const I2 = invariant(
  "I2",
  "the emblem: at most once per race week per mount, right after its action; never under Directo or reduced motion, in a watch, or when restoring at stage race",
  (p) => !p.emblemOnWatch,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      const seen = new Set<string>();
      const reload = of(mount, "reload")[0];
      const r = reload?.before.record;
      const restoredRace =
        r?.phase === "decided" && r.stage === "race" ? `${r.fp}/w:emblem` : undefined;
      mount.forEach((e, i) => {
        if (e.type !== "done" || e.beat.kind !== "emblem") return;
        const k = e.beat.key;
        if (k.startsWith("watch:")) out.push(`${where(e)}: the emblem over a watch`);
        if (w.pace === "direct" || w.reduced)
          out.push(`${where(e)}: the emblem under ${w.reduced ? "reduced motion" : "Directo"}`);
        if (seen.has(k)) out.push(`${where(e)}: ${k} twice in a mount`);
        seen.add(k);
        if (k === restoredRace)
          out.push(`${where(e)}: the emblem of a week restored at stage race`);
        // between the decision (or the mount's start) and the emblem: only the week's action
        const fp = fpOfKey(k);
        const from = lastIndex(mount, (d, j) => j < i && d.type === "decide" && d.week.fp === fp);
        for (const d of mount.slice(from + 1, i))
          if (d.type === "done" && d.beat.key !== `${fp}/w:result` && d.beat.key !== `${fp}/w:fx`)
            out.push(`${where(e)}: ${label(d.beat)} between the week's action and its emblem`);
      });
    }
    return out;
  },
);

// --- I3 -----------------------------------------------------------------------------------------

const SCENE_SCREEN: Readonly<Record<string, string>> = {
  menu: "menu",
  prerace: "position",
  race: "race",
  end: "end",
};

const I3 = invariant(
  "I3",
  "black only under a covered emblem with a scene next; a scene sits over its own mode's screen",
  always,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const [shown, next] = shownOf(f.beats);
      const s = f.flow.screen;
      if (
        s.kind === "black" &&
        !(shown?.kind === "emblem" && shown.covered && next?.kind === "scene")
      )
        out.push(`${where(f)}: black under ${shown ? label(shown) : "nothing"}`);
      const layer = f.flow.layer;
      if (layer?.kind !== "scene") continue;
      if (layer.replay) {
        const over =
          s.kind === "race"
            ? s.stage === "result"
            : ["menu", "plan", "end", "position"].includes(s.kind);
        if (!over) out.push(`${where(f)}: a scene seen again over ${s.kind}`);
      } else if (shown?.kind !== "scene" || shown.key !== layer.key)
        out.push(`${where(f)}: the scene in front is not the beat on screen`);
      else if (SCENE_SCREEN[shown.where] !== s.kind || (s.kind === "race" && s.stage !== "held"))
        out.push(`${where(f)}: a ${shown.where} scene over ${s.kind}`);
    }
    return out;
  },
);

// --- I4 -----------------------------------------------------------------------------------------

const I4 = invariant(
  "I4",
  "after a decision no idle menu until its race's result is done; the decided card has no way back",
  always,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      // the decided week's fp, and its race step's once «Correr» ran
      let open: string | undefined;
      let race: string | undefined;
      const first = of(mount, "frame")[0];
      if (first?.facts.record?.phase === "decided") open = first.facts.record.fp;
      for (const e of mount) {
        if (e.type === "decide") {
          open = e.week.fp;
          race = undefined;
        } else if (e.type === "act" && e.via === "run" && e.fpBefore === open) race = e.fp;
        else if (e.type === "done" && race !== undefined && e.beat.key === `${race}/race:result`) {
          open = undefined;
          race = undefined;
        } else if (e.type === "frame" && open !== undefined && e.flow.top.kind === "idle")
          out.push(`${where(e)}: an idle ${e.flow.screen.kind} inside a decided week`);
        else if (e.type === "probe" && e.name === "back on the decided card" && e.changed)
          out.push(`${where(e)}: the decided card went back to the menu`);
      }
    }
    return out;
  },
);

// --- I5 -----------------------------------------------------------------------------------------

const fxOf = (d: Done | undefined): string[] =>
  d?.beat.kind === "fx" ? d.beat.fx.map((x) => JSON.stringify(x)) : [];

const I5 = invariant(
  "I5",
  "a race week's effects: the action's part (last shown) plus the race's are the week's, and no kind twice in a mount (rule 36)",
  (p) => p.endSequence,
  (w) => {
    const out: string[] = [];
    for (const season of groups(w.trace, "season")) {
      const dones = of(season, "done");
      for (const a of of(season, "act")) {
        if (a.via !== "run") continue;
        const isWeek = (d: Done) =>
          d.beat.key === `${a.fpBefore}/w:fx` || d.beat.key === `${a.fp}/fx`;
        const action = dones.filter((d) => d.beat.key === `${a.fpBefore}/w:fx`).at(-1);
        const race = dones.filter((d) => d.beat.key === `${a.fp}/fx`).at(-1);
        const got = sorted([...fxOf(action), ...fxOf(race)]);
        const want = sorted(weekFx(a.step, w.ctx.ruleset, "all").map((x) => JSON.stringify(x)));
        if (got !== want) out.push(`${where(a)}: the week's effects were [${got}], not [${want}]`);
        for (const mount of groups(season, "mount")) {
          const kinds = of(mount, "done")
            .filter(isWeek)
            .flatMap((d) => (d.beat.kind === "fx" ? d.beat.fx.map((x) => x.kind) : []));
          const twice = kinds.filter((k, i) => kinds.indexOf(k) !== i);
          if (twice.length > 0) out.push(`${where(a)}: ${twice.join(", ")} twice in a mount`);
        }
      }
    }
    return out;
  },
);

// --- I6 -----------------------------------------------------------------------------------------

const I6 = invariant(
  "I6",
  "every committed step is acknowledged exactly once (across reloads), before the next decision",
  (p) => p.endSequence,
  (w) => {
    const out: string[] = [];
    for (const season of groups(w.trace, "season")) {
      for (const a of of(season, "act")) {
        const acks = of(season, "ack").filter((k) => k.fp === a.fp);
        if (acks.length !== 1) out.push(`${where(a)}: its step acknowledged ${acks.length} times`);
        const i = season.indexOf(a);
        const next = season.findIndex((e, j) => j > i && (e.type === "act" || e.type === "decide"));
        const ack = acks[0] ? season.indexOf(acks[0]) : -1;
        if (ack >= 0 && next >= 0 && ack > next)
          out.push(`${where(a)}: its step acknowledged after the next decision`);
      }
    }
    return out;
  },
);

// --- I7 -----------------------------------------------------------------------------------------

const I7 = invariant(
  "I7",
  "D2 per mount: a step's effects, then its inheritance card, then the turn scenes; at the start the prologue, then the card",
  (p) => p.order === "d2",
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      // a step's completions: from its act (or the mount's start) to the next act or decision
      let fp = of(mount, "reload")[0]?.before.fp;
      let part: Done[] = [];
      const check = (): void => {
        const idx = (pred: (d: Done) => boolean): number => part.findIndex(pred);
        const card = (start: boolean) => (d: Done) =>
          d.beat.kind === "inspiration" && (d.beat.card.kind === "start") === start;
        const kind = (k: string) => (d: Done) => sceneOf(d.beat)?.trigger.kind === k;
        const fx = idx((d) => d.beat.key === `${fp}/fx` || d.beat.key === `${fp}/ack`);
        const pairs: [number, number, string][] = [
          [fx, idx(card(false)), "the inheritance card before the effects"],
          [idx(card(false)), idx(kind("turn")), "a turn scene before the inheritance card"],
          [fx, idx(kind("turn")), "a turn scene before the effects"],
          [idx(kind("start")), idx(card(true)), "the start's card before the prologue"],
        ];
        for (const [a, b, what] of pairs) {
          const late = part[a];
          if (late && b >= 0 && b < a) out.push(`${where(late)}: ${what}`);
        }
        part = [];
      };
      for (const e of mount) {
        if (e.type === "act" || e.type === "decide") {
          check();
          fp = e.type === "act" ? e.fp : undefined;
        } else if (e.type === "done") part.push(e);
      }
      check();
    }
    return out;
  },
);

// --- I8 -----------------------------------------------------------------------------------------

/** Where a scene played: its beat's mode, or for a passed one the flow's (a goal's before: the card). */
function sceneMode(d: Done): string {
  if (d.beat.kind === "scene") return d.beat.where;
  if (d.flow.mode !== "race") return d.flow.mode;
  return d.flow.screen.kind === "race" ? "race" : "prerace";
}

const I8 = invariant(
  "I8",
  "each due scene completes (plays or passes) exactly once per season, in its mode",
  (p) => p.sceneFilters,
  (w) => {
    const out: string[] = [];
    for (const season of groups(w.trace, "season")) {
      const first = of(season, "frame")[0];
      if (!first) continue;
      const states: SeasonState[] = [
        first.facts.run.run.state,
        ...of(season, "act").map((a) => a.step.after),
      ];
      const hers = first.facts.scenes.filter((sc) => sc.falconess === states[0]?.falconessId);
      const due = new Set(
        hers
          .filter((sc) => states.some((s) => triggerHolds(w.ctx, s, sc.trigger)))
          .map((sc) => sc.id),
      );
      const count = new Map<string, number>();
      for (const d of of(season, "done")) {
        const sc = sceneOf(d.beat);
        if (!sc) continue;
        count.set(sc.id, (count.get(sc.id) ?? 0) + 1);
        if (!due.has(sc.id)) out.push(`${where(d)}: ${sc.id} played, never due`);
        const kind = sc.trigger.kind;
        const want =
          kind === "goal-before"
            ? "prerace"
            : kind === "goal-after" || kind === "end"
              ? "race"
              : "menu";
        const mode = sceneMode(d);
        if (mode !== want)
          out.push(`${where(d)}: ${sc.id} (${kind}) played in ${mode}, not ${want}`);
      }
      for (const id of due)
        if ((count.get(id) ?? 0) !== 1)
          out.push(`season ${first.at.season}: ${id} completed ${count.get(id) ?? 0} times`);
    }
    return out;
  },
);

// --- I9 -----------------------------------------------------------------------------------------

const I9 = invariant(
  "I9",
  "at the end the last step's result or race and its effects complete, and its black box is kept",
  (p) => p.endSequence,
  (w) => {
    const out: string[] = [];
    for (const season of groups(w.trace, "season")) {
      const last = of(season, "act").at(-1);
      if (last?.step.after.status !== "ended") continue;
      const done = new Set(of(season, "done").map((d) => d.beat.key));
      const fp = last.fp;
      const need: string[] = [];
      if (addedRace(last.step)) {
        need.push(`${fp}/race:result`);
        if (w.pace !== "direct") need.push(`${fp}/race:replay`);
      } else if (trainingOutcome(last.step, w.policy.restedCue)) need.push(`${fp}/result`);
      for (const k of need) if (!done.has(k)) out.push(`${where(last)}: ${k} never completed`);
      if (!done.has(`${fp}/fx`) && !done.has(`${fp}/ack`))
        out.push(`${where(last)}: the last week's effects never completed`);
      const box = of(season, "box").find((b) => b.fp === fp);
      if (w.ctx.ruleset.version === "v3") {
        if (!box) out.push(`${where(last)}: no black box kept`);
        else if (box.at.move !== last.at.move || box.at.mount !== last.at.mount)
          out.push(`${where(box)}: the black box kept later than the commit that ended the season`);
      }
    }
    return out;
  },
);

// --- I10, I11 -----------------------------------------------------------------------------------

/** Screens with no `inert` flag: the run's view makes their slot inert under a layer. */
const SLOT_INERT = new Set(["train", "workshop", "plan", "race"]);

const I10 = invariant(
  "I10",
  "one screen and at most one layer; a layer means the screen is inert or black",
  always,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const s = f.flow.screen;
      if (!f.flow.layer) continue;
      const inert = "inert" in s ? s.inert : s.kind === "black" || SLOT_INERT.has(s.kind);
      if (!inert) out.push(`${where(f)}: ${f.flow.layer.kind} over a live ${s.kind}`);
    }
    return out;
  },
);

const I11 = invariant(
  "I11",
  "the wide screen's panel is locked exactly while a layer, the race mode or a training's result is up",
  always,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const [shown] = shownOf(f.beats);
      const want =
        f.flow.layer !== undefined || f.flow.mode === "race" || shown?.kind === "train-result";
      if (f.flow.desk.locked !== want)
        out.push(`${where(f)}: the panel ${want ? "open" : "locked"} on ${shown && label(shown)}`);
    }
    return out;
  },
);

// --- I12 ----------------------------------------------------------------------------------------

const I12 = invariant(
  "I12",
  "a reload inside a decided week plays that week on (same input and position), no idle menu, and «Correr» runs it",
  (p) => p.resume,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      const reload = of(mount, "reload")[0];
      const r = reload?.before.record;
      if (!reload || r?.phase !== "decided" || r.fp !== reload.before.fp) continue;
      let first = true;
      for (const e of mount) {
        if (e.type === "act") {
          if (e.via !== "run")
            out.push(`${where(e)}: ${e.step.input.kind} committed, not the week`);
          else if (
            JSON.stringify(e.week?.input) !== JSON.stringify(r.input) ||
            JSON.stringify(e.step.input) !==
              JSON.stringify(e.week && withPosition(e.week.input, e.week.position))
          )
            out.push(
              `${where(e)}: «Correr» ran ${JSON.stringify(e.step.input)}, not the decided week`,
            );
          break;
        }
        if (e.type !== "frame") continue;
        const [shown] = shownOf(e.beats);
        if (e.flow.top.kind === "idle") out.push(`${where(e)}: an idle menu after the reload`);
        if (!shown) continue;
        if (shown.kind === "position") {
          if (JSON.stringify(shown.week.input) !== JSON.stringify(r.input))
            out.push(`${where(e)}: the card shows another week`);
          if (first && shown.week.position !== r.position)
            out.push(`${where(e)}: the card lost its position`);
          first = false;
        } else if (!shown.key.startsWith(`${r.fp}/w:`) && shown.kind !== "scene")
          out.push(`${where(e)}: ${label(shown)} is not the decided week's`);
      }
    }
    return out;
  },
);

// --- I13 ----------------------------------------------------------------------------------------

const I13 = invariant(
  "I13",
  `no dead end: every move changes something, and every season reaches its end within ${MAX_MOVES} moves`,
  always,
  (w) =>
    w.ends.flatMap((e, i) =>
      e.ended && e.stuck === undefined && e.moves < MAX_MOVES
        ? []
        : [`season ${i + 1}: ${e.stuck ?? "never reached the end"} (${e.moves} moves)`],
    ),
);

// --- I14, I15 -----------------------------------------------------------------------------------

const I14 = invariant(
  "I14",
  "no notice over a layer, the race's replay or finish, or a training's result",
  always,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const [shown] = shownOf(f.beats);
      const s = f.flow.screen;
      const busy =
        f.flow.layer !== undefined ||
        shown?.kind === "replay" ||
        shown?.kind === "finish" ||
        shown?.kind === "train-result" ||
        (s.kind === "race" && (s.stage === "replay" || s.stage === "finish"));
      if (busy && f.flow.toast)
        out.push(`${where(f)}: a notice may show over ${shown && label(shown)}`);
    }
    return out;
  },
);

const I15 = invariant(
  "I15",
  "Directo: no emblem, replay or finish; «Correr» opens on the race's result (after its scene)",
  always,
  (w) => {
    if (w.pace !== "direct") return [];
    const out: string[] = [];
    for (const e of w.trace) {
      if (e.type === "done" && ["emblem", "replay", "finish"].includes(e.beat.kind))
        out.push(`${where(e)}: ${label(e.beat)} under Directo`);
      if (e.type === "frame" && (e.flow.top.kind === "replay" || e.flow.top.kind === "finish"))
        out.push(`${where(e)}: ${label(e.flow.top)} on screen under Directo`);
    }
    w.trace.forEach((e, i) => {
      if (e.type !== "act" || e.via !== "run") return;
      const next = w.trace.slice(i + 1).find((f) => f.type === "frame");
      const s = next?.type === "frame" ? next.flow.screen : undefined;
      if (s?.kind !== "race" || (s.stage !== "held" && s.stage !== "result"))
        out.push(`${where(e)}: «Correr» opened on ${s?.kind}`);
    });
    return out;
  },
);

// --- I16 ----------------------------------------------------------------------------------------

const I16 = invariant(
  "I16",
  "a reload after «Correr» and before «Continuar» plays the race mode on: the replay (Directo: the result), the scene after it if unseen, the result",
  (p) => p.resume,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      const reload = of(mount, "reload")[0];
      const b = reload?.before;
      const step = b?.step;
      if (!reload || !b || !step || b.stepSeen || !addedRace(step)) continue;
      if (b.record?.phase === "raceSeen" && b.record.fp === b.fp) continue;
      if (b.flow.mode !== "race") continue;
      const frame = of(mount, "frame")[0];
      const [shown] = frame ? shownOf(frame.beats) : [];
      const want = w.pace === "direct" ? ["scene", "race-result"] : ["replay"];
      if (!shown || !want.includes(shown.kind))
        out.push(`${where(reload)}: the race mode did not resume (${shown && label(shown)})`);
      let at = 0;
      for (const d of of(mount, "done")) {
        const t = tail(d.beat.key);
        const n =
          t === "race:replay" && d.beat.key === `${b.fp}/race:replay`
            ? 1
            : t === "race:finish"
              ? 2
              : d.beat.kind === "scene" || d.beat.kind === "pass"
                ? 3
                : t === "race:result" && d.beat.key === `${b.fp}/race:result`
                  ? 4
                  : 0;
        if (n === 0 || n < at) {
          out.push(`${where(d)}: ${label(d.beat)} before the race's result after the reload`);
          break;
        }
        at = n;
        if (n === 4) break;
      }
    }
    return out;
  },
);

// --- I17 ----------------------------------------------------------------------------------------

const I17 = invariant(
  "I17",
  "during a training's result the HUD shows the week she trained in",
  (p) => p.trainView,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const [shown] = shownOf(f.beats);
      if (shown?.kind === "train-result" && f.flow.hud?.of.turn !== shown.before.turn)
        out.push(`${where(f)}: the HUD at week ${f.flow.hud?.of.turn}, not ${shown.before.turn}`);
    }
    return out;
  },
);

// --- I18 ----------------------------------------------------------------------------------------

const I18 = invariant(
  "I18",
  "the finish hold only after a replay that ended by itself, never under Directo",
  (p) => p.finishHold,
  (w) => {
    const out: string[] = [];
    for (const mount of groups(w.trace, "mount")) {
      const natural = new Set(
        of(mount, "done")
          .filter((d) => d.beat.kind === "replay" && d.via === "raceNext")
          .map((d) => fpOfKey(d.beat.key)),
      );
      for (const f of of(mount, "frame")) {
        const t = f.flow.top;
        if (t.kind !== "finish") continue;
        if (w.pace === "direct") out.push(`${where(f)}: the finish hold under Directo`);
        if (!natural.has(fpOfKey(t.key)))
          out.push(`${where(f)}: the finish hold after a skipped replay`);
      }
    }
    return out;
  },
);

// --- I19 ----------------------------------------------------------------------------------------

const I19 = invariant(
  "I19",
  "during the week's effects the HUD's week and mood are the week just played",
  (p) => p.fxHud,
  (w) => {
    const out: string[] = [];
    for (const f of of(w.trace, "frame")) {
      const [shown] = shownOf(f.beats);
      const hud = f.flow.hud;
      if (shown?.kind !== "fx" || !hud) continue;
      const of_ = shown.part === "action" ? f.facts.run.run.state : f.facts.run.step?.before;
      if (!of_ || hud.of.turn !== of_.turn || hud.of.mood !== of_.mood)
        out.push(`${where(f)}: the HUD at week ${hud.of.turn} during ${label(shown)}`);
    }
    return out;
  },
);

// --- I20 ----------------------------------------------------------------------------------------

const I20 = invariant(
  "I20",
  "after a reload the first beats are ones whose end was not kept (§1.8): no read week's result or effects, no card shown, no scene seen, no action part past its stage",
  (p) => p.resume,
  (w) => {
    const out: string[] = [];
    for (const reload of of(w.trace, "reload")) {
      const b = reload.before;
      const frame = w.trace
        .slice(w.trace.indexOf(reload))
        .find((e): e is Ev<"frame"> => e.type === "frame");
      if (!frame) continue;
      const r = b.record;
      const raced = r?.phase === "decided" && r.fp === b.fp && r.stage === "race";
      const first = frame.beats.findIndex((x) => !isInstant(x));
      for (const x of frame.beats.slice(0, first + 1)) {
        const t = tail(x.key);
        const mine = fpOfKey(x.key) === b.fp;
        const bad =
          (mine && (t === "result" || t === "fx" || t === "ack") && b.stepSeen) ||
          (x.kind === "inspiration" && b.cardsShown.has(x.card.key)) ||
          ((x.kind === "scene" || x.kind === "pass") && b.seenInRun.has(x.scene.id)) ||
          (mine && raced && t !== undefined && t !== "w:position" && t.startsWith("w:"));
        if (bad) out.push(`${where(reload)}: ${label(x)} again after the reload`);
      }
    }
    return out;
  },
);

// --- I21 ----------------------------------------------------------------------------------------

const I21 = invariant(
  "I21",
  "a watch ends where it began (from the result: the race's effects; from the end: the end), and «Saltar» and the natural end move it on",
  always,
  (w) => {
    const out: string[] = [];
    for (const m of of(w.trace, "watchMove"))
      if (m.from === m.to) out.push(`${where(m)}: the watch did not move from ${m.from}`);
    for (const mount of groups(w.trace, "mount")) {
      const frames = of(mount, "frame");
      const dones = of(mount, "done");
      let watch: { n: number; from: "result" | "end"; turn: number } | undefined;
      for (const f of frames) {
        const nav = f.ui.nav;
        if (nav.at === "watch") {
          if (watch?.n !== nav.n) watch = { n: nav.n, from: nav.from, turn: nav.turn };
          continue;
        }
        if (!watch) continue;
        if (watch.from === "end") {
          if (f.flow.screen.kind !== "end" || f.flow.top.kind !== "idle")
            out.push(`${where(f)}: a watch from the end came back to ${f.flow.screen.kind}`);
        } else {
          const result =
            dones[lastIndex(dones, (d) => d.beat.kind === "race-result" && d.at.move <= f.at.move)];
          const fp = result && fpOfKey(result.beat.key);
          const after = result ? dones.slice(dones.indexOf(result) + 1)[0] : undefined;
          if (!result || result.at.move !== f.at.move)
            out.push(`${where(f)}: a watch from the result ended without the result's «Continuar»`);
          else if (after && after.beat.key !== `${fp}/fx` && after.beat.key !== `${fp}/ack`)
            out.push(
              `${where(after)}: ${label(after.beat)} came after a watch, not the race's effects`,
            );
        }
        watch = undefined;
      }
      const lastFrame = frames.at(-1);
      const reloaded = w.trace.some(
        (e) => e.type === "reload" && lastFrame && e.at.mount === lastFrame.at.mount + 1,
      );
      if (watch && !reloaded && lastFrame) out.push(`${where(lastFrame)}: a watch never ended`);
    }
    return out;
  },
);

// --- I22 ----------------------------------------------------------------------------------------

const I22 = invariant(
  "I22",
  "two derives over the same facts and UI state give the same top, screen and layer",
  always,
  (w) =>
    of(w.trace, "frame")
      .filter((f) => !f.stable)
      .map((f) => `${where(f)}: a second derive changed ${label(f.flow.top)}'s objects`),
);

export const INVARIANTS: readonly Invariant[] = [
  I1,
  I2,
  I3,
  I4,
  I5,
  I6,
  I7,
  I8,
  I9,
  I10,
  I11,
  I12,
  I13,
  I14,
  I15,
  I16,
  I17,
  I18,
  I19,
  I20,
  I21,
  I22,
];

/** How many beats of each kind the walk's bots completed, and how often a few moments came. */
export function coverage(w: Walk): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  const add = (k: string, n = 1): void => {
    out[k] = (out[k] ?? 0) + n;
  };
  for (const e of w.trace) {
    if (e.type === "done") add(e.beat.kind === "fx" ? `fx:${e.beat.part}` : e.beat.kind);
    else if (e.type === "act" && e.via === "event") add("event");
    else if (e.type === "reload") {
      const r = e.before.record;
      add(r?.phase === "decided" && r.fp === e.before.fp ? "reload:decided" : "reload");
      if (e.before.flow.mode === "race" && e.before.flow.screen.kind === "race") add("reload:race");
    } else if (e.type === "box") add("box");
  }
  const watches = new Map<string, string>();
  let before: number | undefined;
  for (const e of w.trace) {
    if (e.type !== "frame") continue;
    const nav = e.ui.nav;
    if (nav.at === "watch") {
      watches.set(`${e.at.mount}/${nav.n}`, nav.from);
      // «Ver otra vez» on a watch's own result: a new watch straight after the last one
      if (before !== undefined && before !== nav.n) add("watch:again");
    }
    before = nav.at === "watch" ? nav.n : undefined;
  }
  for (const from of watches.values()) add(`watch:${from}`);
  add("end", w.ends.filter((e) => e.ended).length);
  return out;
}

const walks = new Map<WalkSpec, Walk>();

/** The spec's walk, played once per test file. */
export function walkOf(spec: WalkSpec): Walk {
  let walk = walks.get(spec);
  if (!walk) {
    walk = runWalk(spec);
    walks.set(spec, walk);
  }
  return walk;
}

/**
 * One test per invariant and walk: always for the target policy, and for the active one only when
 * the policy has what the invariant needs (until then it is skipped, and the step that flips the
 * flag turns it on).
 */
export function itHolds(spec: WalkSpec): void {
  for (const inv of INVARIANTS)
    it.skipIf(spec.policy !== TARGET_POLICY && !inv.requires(spec.policy))(
      `${inv.id}: ${inv.name}`,
      () => {
        expect(inv.check(walkOf(spec))).toEqual([]);
      },
    );
}

/** The kinds of beat (and moments) the target walks must reach between them, so none is vacuous. */
export function itReaches(specs: readonly WalkSpec[], kinds: readonly string[]): void {
  it(`the target walks reach ${kinds.join(", ")}`, () => {
    const total: Record<string, number> = {};
    for (const spec of specs)
      if (spec.policy === TARGET_POLICY)
        for (const [k, n] of Object.entries(coverage(walkOf(spec)))) total[k] = (total[k] ?? 0) + n;
    expect(kinds.filter((k) => !(total[k] ?? 0))).toEqual([]);
  });
}
