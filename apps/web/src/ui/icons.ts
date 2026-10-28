/**
 * The game's concepts as emojis: the ONE place the page keeps them (concept → emoji). They are
 * presentation, like a color: never game text, never in es.json, never instead of a label. The
 * `Icon` component draws one `aria-hidden` next to the text that names the concept, so a screen
 * reader and a system without that emoji still read the label.
 *
 * One concept, one emoji, everywhere. A few concepts share theirs on purpose (`SHARED_ICONS`): a
 * training and the stat it raises, Resistencia and the Físico it enlarges, a goal race and its
 * finish line, durability on a frame and in a race. `icons.test.ts` keeps any other pair apart.
 *
 * Emojis render with the viewer's system font. Most are from Unicode 6–11; 🪂 🪁 🧊 🩹 are
 * 12.0, which Windows 10 draws since 2019. Nothing from 13.0 or later: Windows 10 shows those as empty
 * boxes (the feather 🪶 was one; Plumas use the peacock).
 */
import type { Biome, SegmentType, StatName, Style, TrainingKind } from "@falconess/schema";

type ActionKey = TrainingKind | "workshop" | "rest" | "outing";
type Family<P extends string, K extends string> = Record<`${P}.${K}`, string>;
/** Every family is complete: a new stat, action, segment type, biome or style fails the build. */
type Families = Family<"stat", StatName> &
  Family<"action", ActionKey> &
  Family<"segment", SegmentType> &
  Family<"biome", Biome> &
  Family<"style", Style> &
  Family<"mood", "-2" | "-1" | "0" | "1" | "2"> &
  Record<string, string>;

export const ICONS = {
  // stats, and the trainings that raise them (same emoji)
  "stat.agility": "⚡",
  "stat.stamina": "❤️",
  "stat.technique": "🎯",
  "stat.courage": "🦁",
  "stat.intelligence": "🧠",

  // the eight actions of a week
  "action.train:agility": "⚡",
  "action.train:stamina": "❤️",
  "action.train:technique": "🎯",
  "action.train:risk-flight": "🪂",
  "action.train:simulator": "🖥️",
  "action.workshop": "🔧",
  "action.rest": "💤",
  "action.outing": "☕",

  // Ánimo as a concept (a gain, an event's effect); the status panel shows the level's face
  mood: "😐",
  "mood.-2": "😞",
  "mood.-1": "🙁",
  "mood.0": "😐",
  "mood.1": "🙂",
  "mood.2": "😄",

  // the Falconess's season resources. Vigor = fatigueMax − fatigue, the bar that drains (ADR-0006):
  // the screen never shows fatigue, in any ruleset; 🔋 is the race's energy, so vigor is the arm
  vigor: "💪",
  skillPoints: "⭐",
  scrap: "🔩",
  feathers: "🦚",
  injury: "🩹",
  risk: "🎲",
  crew: "👥",
  bond: "🤝",

  // a frame: its four stats, what it carries and what it is
  frame: "🛩️",
  "framestat.powerToWeight": "🚀",
  "framestat.energy": "🔋",
  "framestat.dissipation": "🧊",
  "framestat.durability": "🛡️",
  passive: "🔁",
  quirk: "🧩",
  part: "⚙️",
  rule: "📜",
  skill: "✨",
  skillMiss: "🎲",

  // race resources (the live gauges)
  "race.hp": "❤️",
  "race.energy": "🔋",
  "race.heat": "🌡️",
  "race.durability": "🛡️",

  // terrain
  "segment.flat": "➖",
  "segment.climb": "⛰️",
  "segment.descent": "🎢",
  "segment.jump": "🦘",
  "segment.water": "💧",
  "segment.canyon": "💨",
  "segment.curves": "🌀",
  "biome.desert": "🏜️",
  "biome.mountain": "🏔️",
  "biome.coast": "🌊",
  "biome.urban": "🏙️",
  "biome.tundra": "❄️",

  // styles
  "style.dive": "🦅",
  "style.hover": "🕊️",
  "style.glide": "🪁",
  "style.ground": "🦶",

  // what a runner is doing on the track (flags, timeline cells, events)
  "flag.boost": "⏩",
  "flag.pulse": "🔆",
  "flag.airborne": "☁️",
  "flag.drafting": "🌬️",
  "flag.overheated": "🔥",
  "flag.exhausted": "😵",
  "flag.broken": "💥",
  "flag.stalled": "🛑",
  landing: "🛬",
  detour: "🔀",
  sprintPlan: "🧭",
  trouble: "⚠️",
  dnf: "❌",

  // the tip after a race (race-view's advice): the tip itself, a slower runner, her pace judgement
  advice: "💡",
  "advice.slow": "🐢",
  "advice.pace": "⏱️",

  // races and the season
  goalRace: "🏁",
  finish: "🏁",
  event: "📣",
  "place.1": "🥇",
  "place.2": "🥈",
  "place.3": "🥉",
  grade: "🏆",
  explain: "📖",

  // how a week's training went («Lo que pasó»); a failure shares the DNF's cross
  "outcome.ok": "✅",
  "outcome.fail": "❌",
} as const satisfies Families;

export type IconName = keyof typeof ICONS;

/**
 * Concepts that share an emoji on purpose; any other two concepts must not (icons.test.ts).
 */
export const SHARED_ICONS: readonly (readonly IconName[])[] = [
  ["stat.agility", "action.train:agility"],
  ["stat.stamina", "action.train:stamina", "race.hp"],
  ["stat.technique", "action.train:technique"],
  ["framestat.energy", "race.energy"],
  ["framestat.durability", "race.durability"],
  ["goalRace", "finish"],
  ["risk", "skillMiss"],
  ["mood", "mood.0"],
  ["dnf", "outcome.fail"],
];

export const statIcon = (stat: StatName): IconName => `stat.${stat}`;
export const actionIcon = (kind: ActionKey): IconName => `action.${kind}`;
export const segmentIcon = (type: SegmentType): IconName => `segment.${type}`;
export const biomeIcon = (biome: Biome): IconName => `biome.${biome}`;
export const styleIcon = (style: Style): IconName => `style.${style}`;

/** The face of a mood level, −2 … +2 (outside the range, the nearest end): the current mood only. */
const MOOD_ICONS: readonly IconName[] = ["mood.-2", "mood.-1", "mood.0", "mood.1", "mood.2"];
export function moodIcon(mood: number): IconName {
  return MOOD_ICONS[Math.max(0, Math.min(4, Math.round(mood) + 2))] ?? "mood.0";
}

/** A medal for the first three places, none after. */
export function placeIcon(place: number): IconName | undefined {
  return place === 1 ? "place.1" : place === 2 ? "place.2" : place === 3 ? "place.3" : undefined;
}

/** The emoji itself (the component `Icon` is the usual way to draw one). */
export function iconText(name: IconName): string {
  return ICONS[name];
}
