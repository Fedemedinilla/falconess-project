/**
 * @falconess/race-view: the RaceLog read for people. Pure, text-free view models that `pnpm
 * sim:race` and the web's race screens share, so the terminal and the browser never disagree on
 * what a race shows (docs/race-engine.md 20.6). Nothing here recomputes physics: every number is
 * the log's, or a difference of the log's numbers. Words belong to each reader. One step of a
 * season's log is read here too (`season-step.ts`), for the CLI's week summary and the web's
 * «Lo que pasó».
 */
export {
  ADVICE_MAX,
  ADVICE_MIN_MILLI,
  type AdviceItem,
  type AdviceReason,
  type AdviceStat,
  adviceCauses,
  raceAdvice,
} from "./advice.js";
export { altitudeBand, altitudeColumn } from "./altitude.js";
export type {
  EntryInput,
  GenerateFieldArgs,
  NeutralFixtureArgs,
  RaceEnginePort,
  SimulateOptions,
} from "./engine-port.js";
export {
  type EventItem,
  type EventLine,
  type OverheatSpan,
  type PlainEvent,
  type PulseGroup,
  runnerEventLines,
} from "./events.js";
export {
  buildField,
  FIELD_LIMITS,
  FieldError,
  type FieldSpec,
  learnableSkills,
  type PlayerFieldSpec,
  playerEntryInput,
  signatureFrameOf,
  uniformStats,
} from "./field.js";
export {
  type FlightBeat,
  type FlightPlanEntry,
  flightBeats,
  flightProblems,
} from "./flight.js";
export {
  activeOverlays,
  type FlightAhead,
  type FlightMoment,
  type FlightOverlay,
  flightAhead,
  flightMoments,
  flightOverlays,
  insetEvent,
  type MomentCat,
  type MomentId,
  type OverlayId,
  type OverlayKind,
  slowWindows,
} from "./flight-story.js";
export {
  altitudeAt,
  energyAt,
  FLIGHT_PHASE,
  type FlightModel,
  type FlightPhase,
  type FlightTrack,
  flightModel,
  flightTrackProblems,
  HOP_GAP,
  HOP_TICKS,
  hopAt,
  hpAt,
  isFlightLog,
  lineAt,
  orderAt,
  phaseAt,
  positionAt,
  rowOf,
  sampleKeys,
  speedAt,
  type TakeoffStyle,
} from "./flight-view.js";
export { contentLabels, type Livery, type RaceLabels } from "./labels.js";
export {
  crossingMilliTicks,
  overheatSpans,
  PHASES,
  type PhaseName,
  phaseIndexAt,
  type Runner,
  roundDiv,
  runnersInPlaceOrder,
  SEGMENT_ORDER,
  segmentTypesPresent,
  TICK_HZ,
} from "./log.js";
export {
  type ChanceBranch,
  type ResolvedEvent,
  resolveLoggedEvent,
  type StepLog,
  stepLog,
} from "./season-step.js";
export {
  secondsPerColumn,
  TIMELINE_CELLS,
  type TimelineCell,
  timelineCells,
  timelineColumns,
} from "./timeline.js";
export {
  boostModes,
  type Compressed,
  compressRuns,
  type ModeSpan,
  type SprintPlanEvent,
  type WhyBody,
  type WhyEnergy,
  type WhyGains,
  type WhyJudgement,
  type WhyModel,
  type WhyPhase,
  type WhyPlan,
  type WhySegment,
  type WhySink,
  type WhySkill,
  type WhyTerm,
  whyModel,
} from "./why.js";
