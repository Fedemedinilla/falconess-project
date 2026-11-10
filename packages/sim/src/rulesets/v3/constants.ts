/**
 * Ruleset v3 (ADR-0011, «Carrera v3: vuelo»): stage 1 of the flight race. v2's season and the v1
 * race constants, with the flight constants on top. These are the final values of the prototype
 * (`race-v3-proto`, c3c801a), folded in byte for byte; the comments keep the measurement that set
 * each value. The engine reads flight only through `flightOf(ruleset)`, so v1 and v2, which carry
 * no `flight`, never reach a line of the flight code. The race is frozen (ADR-0010): balance moves
 * content (tracks and calendar, letters, growth, kit), never these rules.
 */
import { type FieldConstants, RACE as RACE_V1, type RaceConstants } from "../v1/constants.js";
import { FIELD as FIELD_V2 } from "../v2/constants.js";

export const RULESET_VERSION = "v3" as const;

/** Flight constants of ruleset v3 (ADR-0011; design7 §3, §10). Units in the comments. */
export type FlightConstants = {
  /** Positions that follow a flight plan, in POS_* order [lead, pack, stalk, closer]. */
  readonly planned: readonly [boolean, boolean, boolean, boolean];
  /** Energy units per band climbed at liftF 1000 (R3; climbE). */
  readonly climbE: number;
  /** Energy units per band per 100 m held at liftF 1000 (R4; holdE). */
  readonly holdE: number;
  /** ‰ of the climb cost when the takeoff is a cornisa (the edge of a descent, R3). */
  readonly cornisaPm: number;
  /** ‰ of the hp drain while alt ≥ 1 (R6). */
  readonly airDrainPm: number;
  /** mm/s added to the body speed by a dive from band 0..3 (R7; only 2 and 3 dive). */
  readonly diveVMms: readonly [number, number, number, number];
  /** η = diveEtaBasePm + diveEtaCouragePm × min(C, 1200) / 1200 ‰ (R7). */
  readonly diveEtaBasePm: number;
  readonly diveEtaCouragePm: number;
  /** Plan geometry, mm (§4). */
  readonly marginM: number;
  readonly lookM: number;
  readonly cornisaLookM: number;
  readonly stalkFromDiv: number;
  readonly closerMinM: number;
  readonly closerLenDiv: number;
  readonly closerPreFinalM: number;
  readonly jumpLipM: number;
  readonly leadJoinM: number;
  /** The pack's Abanico: L / packFanDiv from the final's start (0 = no Abanico). */
  readonly packFanDiv: number;
  readonly packFanMinM: number;
  /**
   * R3c (feel round 3): when her plan only flies to the ceiling (the great dive of the final,
   * the closer's plan in stage 1), the energy she keeps for later before she boosts (`keepOk`,
   * 9.2) already pays that flight: the gate asks energy − cost − jumps ≥ max(keep, flight at
   * her dirty-air hold) instead of keep + flight reserve. A mid-race flight stays on top of the
   * keep (false = off).
   */
  readonly keepFlown: boolean;
  /** R5: the body speed approaches the air cruise in the air (false = held, like a jump). */
  readonly airCruise: boolean;
  /**
   * R7's form: false = `vCore += Δv` as first written, which adds a cross term Δv·(v − target) /
   * kDecel where she touches down above her ground target (curves, exhausted); true (round 1) =
   * the dive's Δv is a separate surge that decays by kDecel on top of the body speed, so its
   * metres are Δv² / (2 kDecel), the design's number, wherever she touches down.
   */
  readonly diveSurge: boolean;
  // --- step 1.2 «Arriba se lucha» (diseno-v3-vuelo.md §4); each rule is off at its round-2 value
  /** L1: half-width ‰ of each flight's own air (one pre-drawn byte of slot 28 or 30); 0 = off. */
  readonly airWPm: number;
  /** L1: holding costs × (1000 − airHoldK × air) / 1000: a bad air also costs. */
  readonly airHoldK: number;
  /** L1: ‰ the centre of the air moves per 1200 technique above 600; the width never moves. */
  readonly airTechPm: number;
  /**
   * L1b (feel round 1): ‰ of her pace draw of the phase (its distance from her window's centre)
   * the air cruise reads, like the ground cruise reads all of it (0 = R5's centre, round 0).
   */
  readonly airPacePm: number;
  /** L2: hold ‰ per band [ground, low, high, ceiling] (all 1000 = off). */
  readonly bandHoldPm: readonly [number, number, number, number];
  /** L3: dirty air: another runner in her band, 0 < gap ≤ dirtyM metres ahead (0 = off). */
  readonly dirtyM: number;
  /** L3: hold ‰ in dirty air at technique 0; technique 1200 removes dirtyTechPm ‰ of the extra. */
  readonly dirtyHoldPm: number;
  readonly dirtyTechPm: number;
  /** L3: in dirty air the legs do not rest (hp drain ×1.0 instead of airDrainPm). */
  readonly dirtyNoRest: boolean;
  /**
   * L4 (feel round 1): the fight for the line runs only while the runner ahead in her band is
   * within fightM metres, closer than the wake (dirtyM); 0 = the whole wake (round 0).
   */
  readonly fightM: number;
  /**
   * L3 (feel round 2): the wake's reach in the high band (2), the cruise lane of the long
   * flights, mm (0 = dirtyM). A long line leaves a long wake; the ceiling, a short hold before
   * the dive, and the low band keep dirtyM. The fight for the line still runs only within fightM.
   */
  readonly dirtyHighM: number;
  /** L4: ticks of dirty air in a row before she tries to go over, once per race (0 = off). */
  readonly escapeTicks: number;
  /** L4: knocked a band down after knockTicks + knockCourTicks × min(C, 1200) / 1200 (0 = off). */
  readonly knockTicks: number;
  readonly knockCourTicks: number;
  /** L6: a fall forced by the tank lands with her landPm and no dive (false = off). */
  readonly forcedLand: boolean;
  // --- step 1.3 «Cuatro despegues» (§3) and L7
  /** S1: how each wing takes off and holds, by STYLE code [dive, hover, glide, ground]. */
  readonly wings: readonly [WingFlight, WingFlight, WingFlight, WingFlight];
  /** S2: ‰ of the climb ticks from a cornisa, never below cornisaTicksFloor (1000 = off). */
  readonly cornisaTicksPm: number;
  readonly cornisaTicksFloor: number;
  /** L7: a skill that fires in the air is held and released on touchdown, whole (false = off). */
  readonly heldSkill: boolean;
  // --- round 5 (design7 measure/final.md: the design review F1-F11 of race-v3-proto 4f9b899)
  /**
   * F2: the dive is felt in the air: each band she drops adds its share of the dive's Δv to her
   * surge (Δv × bands dropped / fromBand), the last share on touchdown; the descent ticks are the
   * wing's `diveTicks` (false = the whole Δv on touchdown, round 4).
   */
  readonly diveAirShare: boolean;
  /** F7: a takeoff from the ground climbs band 1 in `climbTicks` too (false = band 1 at once). */
  readonly climbFromGround: boolean;
  /** F5: entering a Terreno líquido in flight hits nothing (false = the water hits flyers too). */
  readonly airWaterFree: boolean;
  /** F5: ‰ of the water and climb penalty the air cruise pays below `airTerrainFreeBand` (1000 = the ground's). */
  readonly airTerrainPm: number;
  /** F5: from this band the air cruise pays no water or climb penalty (4 = never). */
  readonly airTerrainFreeBand: number;
  /**
   * F6: in the air, one rule by band and metres for every wing: another runner in her band within
   * the wake (fightM < gap ≤ dirtyM, or dirtyHighM in the high band) tows her (her wing's `draftPm`
   * on the air cruise) and holding there pays the wake's `dirtyPm` (L3); within `fightM` it is
   * dirty air too: no rest and the fight for the line (L4). Nobody is towed by a runner on the
   * ground. false = round 4: the whole wake is dirty and the hover draft reads her place in the field.
   */
  readonly airDraftBand: boolean;
  /**
   * F3: a won line pays: after she goes over (L4) and is not knocked back, her dive gains
   * `overDivePm` ‰ of one more band's share (Δv / fromBand); 0 = off.
   */
  readonly overDivePm: number;
  /**
   * F9 (N1 brought forward from stage 2): on a dive's touchdown, if the start-of-tick snapshot has
   * another unfinished runner on the ground from `nerveBackM` behind to `nerveM` ahead, a nerve
   * test (16 bits of the pre-drawn slot 29, at most `nerveMax` per race): she flinches with
   * p = clamp(nerveBasePm − nerveSlopePm × min(C, 1200) / 1200, nerveMinPm, nerveBasePm) ‰ and
   * opens the wings (no dive, the air share lost, her landing paid); held, the dive × (1000 +
   * nerveBonusPm) ‰. nerveM 0 = off.
   */
  readonly nerveM: number;
  readonly nerveBackM: number;
  readonly nerveBasePm: number;
  readonly nerveSlopePm: number;
  readonly nerveMinPm: number;
  readonly nerveBonusPm: number;
  readonly nerveMax: number;
  /**
   * F8: ground wings take off too, with the Turbina (a skim driven by the frame's thrusters): only
   * the flights of her plan whose band is ≤ her wing's `maxBand` (false = ground wings never fly).
   */
  readonly groundFlies: boolean;
  /**
   * Round 5 (F1): her own air (L1) and its hold term apply from this band up; below it a skim is a
   * ground-effect line, steady at her air cruise (1 = every band, round 4; 2 = the low band skims).
   */
  readonly ownAirFromBand: number;
  /**
   * F3: the line she won is clean air: after an over she holds the new band at the price of the
   * band she left (false = the new band's price, round 4).
   */
  readonly overCleanHold: boolean;
  /** F3: ‰ added to her own air (L1) for the rest of a flight whose line she won (0 = off). */
  readonly overAirPm: number;
  // --- two lines per band (owner, 2026-11-08: «pasar por los costados»)
  /**
   * Two lines per altitude band, inside (0) and outside (1). The wake (dirty air and tow) is only
   * directly behind in the same band and the same line; side by side is clean air. In the same band
   * and line nobody flies through the runner ahead: within `blockMm` her speed is the one ahead's.
   * She leaves the wake by the side (a lateral move that costs metres, `switchMm`), over (a band up,
   * energy, L4) or is knocked down. On the ground there are no lines (false = round 5).
   */
  readonly lines: boolean;
  /** Same band and line, the runner ahead within blockMm mm: she cannot fly through her. */
  readonly blockMm: number;
  /** Ticks blocked behind the one ahead before she moves to the other line: sideTicksMax − span × min(I, 1200) / 1200. */
  readonly sideTicksMin: number;
  readonly sideTicksMax: number;
  /** mm of the other line she checks ahead before she moves: sideLookMm × min(I, 1200) / 1200. */
  readonly sideLookMm: number;
  /** Gap she needs alongside in the other line: slotBaseMm − slotCourMm × min(C, 1200) / 1200 mm. */
  readonly slotBaseMm: number;
  readonly slotCourMm: number;
  /** mm of path a lateral move costs at technique 600 (×1000 ‰ there); × (techHiPm − (hi − lo) × T / 1200). */
  readonly switchMm: number;
  readonly switchTechHiPm: number;
  readonly switchTechLoPm: number;
  /** Ticks the lateral move takes (its metres are paid over them). */
  readonly moveTicks: number;
  /** ‰ of the distance the outside line adds: outPm − outAgiPm × min(A, 1200) / 1200. */
  readonly outPm: number;
  readonly outAgiPm: number;
  /** Ticks in the outside line before she cuts back inside, with the inside clear backMm behind. */
  readonly backTicks: number;
  readonly backMm: number;
  /**
   * Closing the door: the runner ahead sees one that just moved to her other line (≤ moveTicks
   * ago) within doorMm behind, and moves into that line in front of her with p = doorBasePm +
   * doorIntPm × min(I, 1200) / 1200 ‰ (one byte of the pre-drawn slot 31 per decision, at most 4
   * per race, one door per flight). Both pay: she the lateral move, the passer doorLossMm mm.
   */
  readonly doorMm: number;
  readonly doorBasePm: number;
  readonly doorIntPm: number;
  readonly doorLossMm: number;
  /**
   * A line won by the side pays like one won over (F3): after a pass by the side in this flight her
   * dive gains `sideDivePm` ‰ of one band's share (0 = off). Not cumulative with F3's.
   */
  readonly sideDivePm: number;
  // --- stage 3 «Todas vuelan» (owner, 2026-11-08: a Falconess that does not fly is behind)
  /**
   * Everyone flies: the lead skims (band 1) early and over every Colina, Terreno líquido and Salto;
   * the pack skims the long flats and the Pasillos; the low band («a ras») pays `skimTerrainPm` of
   * the water and climb penalty, rests the legs at `skimDrainPm` and holds at `skimHoldPm` of the
   * band's price. false = the two lines of 2026-11-08 byte for byte (INV-8); every knob below is
   * read only when it is on.
   */
  readonly allFly: boolean;
  /** Lead: an early skim from the start's end for max(leadEarlyMinM, L / leadEarlyDiv) (0 = none). */
  readonly leadEarlyDiv: number;
  readonly leadEarlyMinM: number;
  /** Lead: skims every Colina, Terreno líquido and Salto (false = only the early skim; probes). */
  readonly leadObstacles: boolean;
  /** Pack: skims every flat at least packFlatMinM metres long between the start's end and the final (0 = none). */
  readonly packFlatMinM: number;
  /** ‰ of the water and climb penalty the low band pays (the air above pays `airTerrainPm`). */
  readonly skimTerrainPm: number;
  /** ‰ of the hp drain at the low band (ground effect; the bands above rest at `airDrainPm`). */
  readonly skimDrainPm: number;
  /** ‰ of the low band's hold (replaces bandHoldPm[1] while allFly is on). */
  readonly skimHoldPm: number;
  /** ‰ added to the air cruise at the low band (ground effect: the skim is a little faster than the legs). */
  readonly skimCruisePm: number;
  /** ‰ of the climb a takeoff to the low band pays (a skim lifts cheap). */
  readonly skimClimbPm: number;
  /** Race constants while allFly is on: the jump's landing at technique 0 (R8, «saltar barato»; 0 = the stage's). */
  readonly skimLandBasePm: number;
  /** ‰ of a Salto's liftRequired a low-band flight pays when it crosses it (a skim still lifts over the lip). */
  readonly skimJumpPm: number;
  /** ‰ of the Terreno líquido hit a low-band flight takes (a skim splashes; the bands above stay dry). */
  readonly skimWaterPm: number;
  /** mm/s a takeoff from the ground to the low band adds to the body speed (the skim's lift push). */
  readonly skimLiftMms: number;
  /** A skim (ground to the low band) is a shallow lift: she keeps all her speed whatever her wing's liftSpeedPm. */
  readonly skimKeepSpeed: boolean;
  // --- neutral wings (owner, 2026-11-08: wings lose their stats; .work/design7/measure/neutral-final.md)
  /**
   * Every frame races on one neutral profile (`neutralFrame`): no manufacturer rule, no frame
   * passive, no part or quirk effect; the Falconess's own passive (her signature frame's, now
   * her skill) is the only passive. Read by `freezeEntry` (content side). false = the frame's stats.
   */
  readonly neutralFrames: boolean;
  /** The neutral frame profile: PW ‰, energy, dissipation and durability (content units). */
  readonly neutralFrame: {
    readonly powerToWeight: number;
    readonly energy: number;
    readonly dissipation: number;
    readonly durability: number;
  };
  /** No wear: overheat, crashes and water never cost durability and wings never break. */
  readonly noWear: boolean;
  /**
   * The wing's style is only its gesture (the wing table): on the ground every runner races the
   * same physics (no dive stoop, no hover draft, no glide start or lead terms, the Rasante jumps
   * like everyone instead of going round). false = the style's ground physics of v2.
   */
  readonly neutralStyles: boolean;
  /** ‰ added to the air cruise from the high band up (the line up there is quicker; 0 = off). */
  readonly highCruisePm: number;
  /**
   * 0 = a skim (low band) climbs over the runner ahead after `escapeTicks`, like every band.
   * Otherwise a skim keeps to her lines and only the lead climbs over the low traffic, after this
   * many ticks of dirty air in a row (calmer bands; without it the Punta of the steps fell from
   * 24 to 13 % at 750).
   */
  readonly skimEscapeTicks: number;
  /** Pack: also skims every Salto that ends before the final (±20 m, like the lead) (false = off). */
  readonly packJumps: boolean;
  // --- stamina pays effort (owner, 2026-11-09; .work/design7/measure/stamina-final.md)
  /**
   * Maneuvers cost the body (hp), not only energy: hits in hp at stamina 0, each × 1.2e6 / stamDiv
   * (the stamina divisor of the drain), so Resistencia shrinks every hit like the drain. 0 = off.
   * `hpTakeoff` a takeoff from the ground; `hpDiveBand` per band of a dive pulled out (from band
   * ≥ 2, on touchdown); `hpSwitch` a line switch (pass, escape, the door she closes); `hpFight` a
   * line fight (over or knock) and the door closed on her; `hpDirtyPm` ‰ of the drain added while
   * in dirty air; `hpBoxedPm` ‰ of the drain added while boxed in or blocked in her line.
   */
  readonly hpTakeoff: number;
  readonly hpSkimTakeoff: number;
  readonly hpDiveBand: number;
  readonly hpSwitch: number;
  readonly hpFight: number;
  readonly hpDirtyPm: number;
  readonly hpBoxedPm: number;
  /**
   * The bar budgets her own plan: at the start her hpMax grows by the hits of her planned takeoffs
   * and dives priced at this Resistencia (0 = no budget). Below it she pays her plan, above it she
   * keeps some; what the plan cannot know (the traffic: switches, fights, doors, dirty air, boxed
   * in) is never budgeted, so a clean race asks little Resistencia and a contested one more.
   */
  readonly hpPlanRefStamina: number;
  /** ‰ of `hpDirtyPm` a skim (the low band) pays in dirty air: the line behind at ras is calmer. */
  readonly hpDirtySkimPm: number;
  /**
   * ‰ of the traffic's hits and drips (switch, fight, door, dirty, boxed) per distance (sprint,
   * mile, medium, long): the long races already ask for Resistencia on their own (+100 is worth
   * 17-50 m there), the sprint did not (0 m); the plan's hits are not scaled.
   */
  readonly hpDistPm: readonly [number, number, number, number];
  /**
   * A running sprint plan replans after a hit, or once the drip since the last plan passes this
   * many hp (0 = never): the plan spends her hp to the line, so an unplanned cost would empty her
   * on the way and leave her at the speed floor (σ of the sprint 15 → 31 m without it).
   */
  readonly hpReplanHp: number;
  /** An exhausted runner starts no new maneuver: no over, no line switch, no door (false = off). */
  readonly exhaustedStill: boolean;
  /**
   * Distance letters (owner 2026-11-09): the course's distance (sprint ≤ distanceMaxM[0] m, mile ≤
   * [1], medium ≤ [2], long above) picks the entry's letter, and `distancePm[rank]` ‰ (S, A, B, C,
   * D, E, F, G; B = 0, the rivals' letter, so a field of B races as before and a letter only
   * matters against the field: A −30, C +30 ‰) worsens (or, below 0, helps) the distance's
   * dominant aspect of flight: sprint the takeoff and the dive
   * (climb cost up, dive Δv down), mile winning the line up high (knock sooner, door and won-line
   * bonus down, longer side move), medium the cost of holding altitude, long the legs' rest in the
   * air and the long flight's hold (half). false = no letter is read.
   */
  readonly distanceLetters: boolean;
  readonly distanceMaxM: readonly [number, number, number];
  readonly distancePm: readonly number[];
  /**
   * The core every position flies (all fly): ‰ of the letter's `distancePm` taken off her air
   * cruise, per distance (sprint, mile, medium, long). Without it a letter only touched the
   * Remate's dive in the sprint (0.3 m) or the low band's line in the mile.
   */
  readonly distanceAirPm: readonly [number, number, number, number];
  /** ‰ of the letter's pm added to the air drain in the long (her legs rest less up there). */
  readonly distanceRestPm: number;
  /** ‰ of the letter's pm taken off the dive's Δv in the sprint (the takeoff's climb pays 1000 ‰). */
  readonly distanceDivePm: number;
  // --- the kick on low hp (owner 2026-11-09, .work/design7/measure/kick-final.md)
  /**
   * The final sprint on low hp: at each plan or replan, with `h` = her hp in ‰ of her bar, the
   * share of her energy the spurt and the kick may spend is `kick = clamp(1000 × (h − lo) / (hi −
   * lo), 0, 1000)` ‰ (`kickHiPm`, `kickLoPm` per distance: sprint, mile, medium, long; hi 0 = off,
   * kick 1000). The rest stays in the tank, locked for the spurt and the kick: full bar, full
   * sprint; half, a shorter one; almost empty, she barely pushes.
   */
  readonly kickHiPm: readonly [number, number, number, number];
  readonly kickLoPm: readonly [number, number, number, number];
  /**
   * With the kick on: when the plan sees she cannot reach the line at final cruise, she paces
   * herself (`pace = 1000 × hp / cruise hp`, ≥ `kickPaceMinPm`, ‰ of the final cruise, never under
   * the speed floor) instead of emptying and falling to the floor (false = off).
   */
  readonly kickPace: boolean;
  readonly kickPaceMinPm: number;
  /** With the kick on: a replan after a hit or the drip ignores `maxReplans` (false = off). */
  readonly kickReplanFree: boolean;
  /**
   * The kick on low hp: the line fight's hit splits by side (hp at stamina 0, like `hpFight`):
   * `hpKnock` the one knocked down, `hpDoor` the one a door was closed on (`hpFight` stays the
   * winner's, who goes over). With the kick off both are `hpFight`.
   */
  readonly hpKnock: number;
  readonly hpDoor: number;
  /**
   * The kick on low hp: the traffic's hits (switch, fight, knock, door) shrink by her Resistencia
   * twice, `× (1.2e6 / stamDiv)²` (the plan's takeoffs and dives keep the single factor; false =
   * once, as before): the body that resists pays much less for the same fight.
   */
  readonly hpTrafficSq: boolean;
  /**
   * The kick on low hp: the traffic's hits and drips never take her under the hp she needs to
   * reach the line at cruise (`lineHp`, refreshed at every hit, takeoff and plan): the traffic eats
   * her kick, never her cruise, so the worst a fight can do is leave her without a kick (false = a
   * hit can empty her: the speed floor).
   */
  readonly hpHitFloor: boolean;
  /**
   * The air's Technique centre (L1, `airTechPm`) reads her Technique against her own build, `600 +
   * T − (A + S + T + C + I) / 5`, instead of against 600 (false = against 600). Root cause of the
   * stat-level bias (kick-final.md): with the absolute centre every high flyer of a 300 field lost
   * 7.5 ‰ of her air and the skim nothing (Acecho 10.6 % of the sprint at 300, Pelotón 32-36 % at
   * 300 on five tracks), and at 750 the high flyers gained 3.75 ‰. A technical build still flies
   * better: +100 Technique moves the centre 2 ‰ (2.5 before).
   */
  readonly airTechRel: boolean;
  // --- balance polish (2026-11-09; .work/design7/measure/polish-final.md)
  readonly closerRoomMinM: number;
  /**
   * The dive's power (L5, η) reads her Courage against her own build, `600 + C − (A + S + T + C +
   * I) / 5`, like the air's centre (`airTechRel`; false = absolute). With the absolute η a 300
   * field dived at 850 ‰ and a 750 field at 1075 ‰: the Remate and the Acecho rose with the level
   * of the field.
   */
  readonly diveCourRel: boolean;
  /**
   * The Punta jumps on her legs a Salto she meets in the start, like the Pelotón (`packJumps`):
   * her skims take off from the start's end, and the early skim starts past a Salto it would start
   * inside; a Colina still joins her early skim (without it the canyon lost a sixth of its
   * fights, CONT-1). false = she took off 20 m before the steps' first Salto, in the middle of the
   * start, and lost the start's push in dirty air behind the other Punta.
   */
  readonly leadStartJumps: boolean;
  /**
   * The bar budgets her plan's hits at her own Resistencia instead of `hpPlanRefStamina` (false =
   * at 600): the plan is free and only the traffic costs, at every level. With 600 a 300 field paid
   * ≈ 14 % of every planned takeoff and dive over its budget (the flyers exhausted sooner in the
   * Milla and the Larga: open-sky Remate −6 m flying vs not at 300) and a 750 field got 5 % back.
   */
  readonly hpPlanOwn: boolean;
  /**
   * The great dive is the air's descent: while she dives from band ≥ 2 (a planned dive or a won
   * line's, not a forced fall), a skill whose trigger is a descent («Golpe en picada», «Amiga de la
   * gravedad») sees a descent (false = only the ground's descents: the Remate who flies over the
   * Bajada of the final lost her only Bajada skill to the air).
   */
  readonly diveDescent: boolean;
  // --- homes per track and the weak's own kit (owner 2026-11-09; .work/design7/measure/homes-final.md)
  /**
   * ADR-0009: a passive's flight effect (`PassiveSkill.flight`) enters the race as the
   * trait `diveSkill` (false = never: v3 is the balance polish, 6e98e90, byte for byte).
   */
  readonly skillFlight: boolean;
  /**
   * Trim (owner 2026-11-09, trim-final.md): the passive's flight ‰ is read per race distance
   * (`PassiveSkill.flight.diveVPmDistance`; false = `diveVPm` everywhere: homes, 5f470a2).
   */
  readonly skillFlightDistance: boolean;
  /**
   * Fix (2026-11-10, ADR-0010 §2): a skim (band 1) planned to start inside a Salto she is jumping
   * on her legs keeps the jump's band 1 as her skim (no climb, `takeoff` holds the band she is in).
   * false = the takeoff found no band above the jump's and the planned skim was lost (`noLift`).
   */
  readonly jumpHoldsSkim: boolean;
};

/** S1: a wing's takeoff style (diseno-v3-vuelo.md §3). */
export type WingFlight = {
  /** Log name of the style. */
  readonly style: "lance" | "column" | "ramp" | "turbine" | "neutral";
  /** Ticks per band climbed. */
  readonly climbTicks: number;
  /** ‰ of the climb cost. */
  readonly climbCostPm: number;
  /** ‰ of the body speed kept when she leaves the ground. */
  readonly liftSpeedPm: number;
  /** ‰ of the hold cost. */
  readonly holdPm: number;
  /** ‰ of the dive's Δv. */
  readonly diveWingPm: number;
  /** F2: ticks per band descended. */
  readonly diveTicks: number;
  /** F6: ‰ of the air cruise in another's wake in her band (`airDraftBand`). */
  readonly draftPm: number;
  /** F8: the highest band the wing flies to; planned flights above it are not flown. */
  readonly maxBand: number;
  /**
   * Round 5: ‰ added to the centre of her own air on every flight (L1): how well the wing holds a
   * line. It moves the centre, never the width (AIR-4).
   */
  readonly airPm: number;
};

/** The round-2 flight of every wing (6 ticks per band, no cost or dive term): tests and step 1.2. */
export const NEUTRAL_WING: WingFlight = {
  style: "neutral",
  climbTicks: 6,
  climbCostPm: 1000,
  liftSpeedPm: 1000,
  holdPm: 1000,
  diveWingPm: 1000,
  diveTicks: 3,
  draftPm: 1005,
  maxBand: 3,
  airPm: 0,
};
/**
 * The neutral wings of 2026-11-08 (owner: wings lose their stats): each style keeps only its
 * gesture, the time to climb a band and to fall one (Lanza 2 / 2, Columna 4 / 3, Rampa 8 / 4,
 * Turbina 3 / 3); every wing pays the same climb and hold, keeps all her speed on the lift, dives
 * the same Δv, is towed ×1.005 and holds the same line. The Turbina flies every band now: a wing
 * limited to the low band cannot be budget-neutral for a closer's great dive.
 */
export const WINGS: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  { ...NEUTRAL_WING, style: "lance", climbTicks: 2, diveTicks: 2 },
  { ...NEUTRAL_WING, style: "column", climbTicks: 4, diveTicks: 3 },
  { ...NEUTRAL_WING, style: "ramp", climbTicks: 8, diveTicks: 4 },
  { ...NEUTRAL_WING, style: "turbine", climbTicks: 3, diveTicks: 3 },
];

export const BAND_LOW = 1;
export const BAND_HIGH = 2;
export const BAND_CEILING = 3;

/**
 * The flight constants of stage 1 (ADR-0011), every rule on. How the prototype got here (design7
 * `.work/design7/measure/`); calibration round 1 (round-1.md) moved five values off the first guess:
 * - `airDrainPm` 850 → 975: the rest is a cliff amplifier (whoever empties her legs later wins the
 *   long tracks), so ×0.85 gave the stalk 54-74 % of the canyon at 300 and 600;
 * - `diveSurge` on: R7's mm (Δv² / 2 kDecel) whatever the ground target at touchdown;
 *   `vCore += Δv` gave 11 m in the sprint and 15 m in the canyon instead of 6;
 * - `draftGroundOnly` off: the hover draft also reaches a flight (hover stalks lost 5-7 m a sprint);
 * - `stalkFromDiv` 3 → 4: the stalk flies from L/4 (more air, the field stays ≥ 10 % up);
 * - `closerLenDiv` 12 → 30: the closer holds ≥ max(100 m, L/30), so in the canyon her ceiling fits
 *   100 m before the final instead of after the water at 2620 m, where low-stat legs are gone.
 * Round 2 (measure/round-2.md) moved two more:
 * - `diveVMms` high band 4900 → 5400: the stalk flies 45 % of every track at the centre of her pace
 *   window and loses wins to variance, not metres; her dive from high now gives ≈ 4.9 m (was 4.0)
 *   and the great dive stays the biggest (6 m). Stalk + hover in the sprint at 750 went 17.6 → 21 %;
 * - `closerPreFinalM` 100 → 150: more air for the closer (sprint 650-800, canyon 1850-2000) and
 *   Picada + closer in the sprint at 750 back to 34-37 % (was 38-41 %).
 * Feel round 1 (measure/feel-round-1.md) moved R6 with the struggle:
 * - `airDrainPm` 975 → 990: with her pace in the air (L1b) the stalk's mean edge showed (28-30 %
 *   of the long tracks at 600; Suspensión + Acecho 33 % of the canyon at 600-750). Holding height
 *   rests the legs less: flying is not free.
 * Feel round 3 (measure/feel-round-3.md) brings R3c (`keepFlown`): a closer kept for the final
 * both the keep of her pre-final boosts (diveKeep) and her ceiling flight's reserve, so on the
 * ridge she never spent her spare energy on the first descent (Peregrina at T46: 0.04 s ahead of
 * the 3rd rival at 500 m against 0.57 s in v2, coin share 35 %). Now the keep pays the flight,
 * priced at her dirty-air hold so the shared ceiling does not force more falls.
 */
/*
 * ADR-0011 §2: the knobs the prototype measured and left off in every step (stage 2's canyon
 * ceiling and ground grip, the hover draft only on the ground, the Planeo's terms on the Punta,
 * the dive room and the last feature of the final) were removed with their code; the race did not
 * move a byte (digest of 1656 races and INV-5..INV-15).
 */
export const FLIGHT: FlightConstants = {
  // F1 (round 5): the pack skims the Pasillos at the low band (no Abanico until stage 2)
  planned: [false, true, true, true],
  climbE: 8,
  holdE: 1,
  cornisaPm: 500,
  airDrainPm: 990,
  diveVMms: [0, 0, 5_110, 6_600],
  diveEtaBasePm: 700,
  diveEtaCouragePm: 600,
  marginM: 20,
  lookM: 40,
  cornisaLookM: 150,
  stalkFromDiv: 4,
  closerMinM: 100,
  closerLenDiv: 30,
  closerPreFinalM: 150,
  jumpLipM: 10,
  leadJoinM: 60,
  packFanDiv: 0,
  packFanMinM: 80,
  keepFlown: true,
  airCruise: true,
  diveSurge: true,
  // step 1.2 (§4): the F2 «FIN» package without the nerve (stage 2), with feel round 1
  // (measure/feel-round-1.md): the air reads 800 ‰ of her pace draw (L1b) and her own air is
  // ±18 ‰ (was ±26 ‰ around the centre: the stalk's σ was 0.66-0.70 of the ground's in the long
  // tracks, AIR-3); the wake reaches 11 m (was 6) and costs ×2.5 at technique 0 (was ×2), but the
  // fight for the line only runs within 5 m (L4, `fightM`), so the struggle shows more and knocks
  // less (RISK-1: 17-18 % of the sprint's flights below plan); she tries to go over after 20
  // ticks (was 30) and courage holds the line longer (knock at 30 + 50·C/1200 ticks: 55 at 600);
  // high and ceiling cost ×1.3 per band·metre (was ×1.25; AIR-2: the stalk's energy in the
  // canyon was ×1.13 of round 2). Feel round 2 (measure/feel-round-2.md): in the high band, the
  // cruise lane, the wake reaches 24 m (`dirtyHighM`): the two stalks of a long track drifted
  // 11-30 m apart and only 20 % of the canyon's long flights had a struggle moment (CONT-1);
  // with 24 m, 26 %, while the ceiling keeps 11 m and the sprint's dirty air stays under 14 %.
  airWPm: 18,
  airHoldK: 10,
  airTechPm: 30,
  airPacePm: 800,
  bandHoldPm: [1000, 1000, 850, 1300],
  dirtyM: 11,
  dirtyHoldPm: 2500,
  dirtyTechPm: 500,
  dirtyNoRest: true,
  fightM: 5,
  dirtyHighM: 24,
  escapeTicks: 45,
  knockTicks: 45,
  knockCourTicks: 50,
  forcedLand: true,
  // step 1.3 (§3, L7)
  wings: WINGS,
  cornisaTicksPm: 500,
  cornisaTicksFloor: 2,
  heldSkill: true,
  // round 5 (measure/final.md, the design review F1-F11 of 4f9b899): F2 the dive is felt in the
  // air (its Δv recalibrated with the metres: 5400 / 6000 → 5110 / 5430, so the ledger's great dive
  // stays ≈ 6 m with the air share), F7 band 1 is climbed too, F5 flying keeps dry and the air pays
  // 90 % of the water and climb (one rule, no free band: the Acecho over the canyon's Colina at 750
  // won too much), F6 the tow by band and mm (×1.005; the Columna ×1.02 and her line +6 ‰, the
  // free hover draft of round 4 was worth ≈ 13-16 points of the sprint at 750), F3 a won line holds
  // at the price of the band she left and dives 650 ‰ of one more band (the struggle pays, bounded:
  // CONT-2), F9 the nerve ×1.10 (×1.15 made the Picada closer win the sprint at 750), F8 and F1
  // the Turbina and the pack's Pasillo (decide the owner)
  diveAirShare: true,
  climbFromGround: true,
  airWaterFree: true,
  airTerrainPm: 900,
  airTerrainFreeBand: 4,
  airDraftBand: true,
  overDivePm: 800,
  nerveM: 6,
  nerveBackM: 3,
  nerveBasePm: 400,
  nerveSlopePm: 600,
  nerveMinPm: 50,
  nerveBonusPm: 100,
  nerveMax: 2,
  groundFlies: true,
  ownAirFromBand: 2,
  overCleanHold: true,
  overAirPm: 0,
  // two lines per band (owner, 2026-11-08; .work/design7/measure/lines-final.md)
  lines: true,
  blockMm: 3_500,
  sideTicksMin: 1,
  sideTicksMax: 12,
  sideLookMm: 24_000,
  slotBaseMm: 4_500,
  slotCourMm: 3_000,
  switchMm: 1_200,
  switchTechHiPm: 1400,
  switchTechLoPm: 600,
  moveTicks: 4,
  outPm: 5,
  outAgiPm: 4,
  backTicks: 15,
  backMm: 3_000,
  doorMm: 4_000,
  doorBasePm: 200,
  doorIntPm: 400,
  doorLossMm: 1_000,
  sideDivePm: 650,
  // stage 3 «Todas vuelan» (owner, 2026-11-08; .work/design7/measure/allfly-final.md)
  // The round (allfly/probe.ts, paired.ts, w0all.ts): a skim with no terrain toll was worth 30-60
  // points to the lead on the canyon (its 500 m Colina and the water) and a Salto skimmed for free
  // saved ~30 energy (liftRequired 20 + 15 on the ridge); skims inside the final cut the legs'
  // kick (circuit lead −13 m). So the low band pays 950 ‰ of the climb and water toll (the air
  // above 900 ‰), 700 ‰ of a Salto's lift, half the water hit, rests the legs like any flight, and
  // ends before the final; what it gives is a short lift push (300 mm/s, decays by kDecel), a
  // cruise 3 ‰ above her air cruise and a cheap lift (700 ‰ of the climb). Round 2: a skim keeps all
  // her speed whatever the wing (the Lanza's 960 ‰ on every skim gave the Planeo 1-2 points of the
  // equal sprint and the ridge at 450, WING-0).
  allFly: true,
  leadEarlyDiv: 3,
  leadEarlyMinM: 150,
  leadObstacles: true,
  packFlatMinM: 200,
  skimTerrainPm: 950,
  skimDrainPm: 990,
  skimHoldPm: 1000,
  skimCruisePm: 5,
  skimClimbPm: 700,
  skimLandBasePm: 0,
  skimJumpPm: 700,
  skimWaterPm: 500,
  skimLiftMms: 100,
  skimKeepSpeed: true,
  // neutral wings (owner, 2026-11-08; .work/design7/measure/neutral-final.md): one frame profile
  // (the race fixtures' neutral frame, close to the mean of the 13 frames: PW 1.03, energy 111,
  // dissipation 62), no manufacturer rule, no wear, the style only a gesture
  neutralFrames: true,
  neutralFrame: { powerToWeight: 1000, energy: 100, dissipation: 60, durability: 100 },
  noWear: true,
  neutralStyles: true,
  // balance polish on neutral wings (measure/neutral-final.md, probes neutral/pos.ts): the high
  // band's line is 3 ‰ quicker and holds at 850 ‰ (the Acecho lost the Columna's and Rampa's
  // cheap hold and fell to 7 % of the sprint at 300); the great dive from the ceiling 5430 → 6600
  // mm/s and a won line dives 800 ‰ of one more band (the Remate lost the Picada's stoop, and the
  // surge now decays in the air too); a skim lifts with 100 mm/s and cruises +5 ‰ (a premium by
  // the metre, not by the takeoff: the Pelotón of the circuit skims four flats); the Pelotón skims
  // the Saltos too (the ridge has one long flat); calmer bands: only the lead climbs over the low
  // traffic (after 90 ticks), and the over and the knock wait 45 ticks (3.4-3.9 band changes per
  // sprint race → 1.6-1.8). The Planeo's ground terms on the Punta (leadGlidePos) were measured
  // and left off: the lead drain gave the Punta 34-39 % of the long tracks.
  highCruisePm: 3,
  skimEscapeTicks: 90,
  packJumps: true,
  // stamina pays effort and the four distances (owner 2026-11-09, stamina-final.md)
  hpTakeoff: 30,
  hpSkimTakeoff: 20,
  hpDiveBand: 15,
  hpSwitch: 32,
  hpFight: 0,
  hpDirtyPm: 1000,
  hpBoxedPm: 3000,
  hpPlanRefStamina: 600,
  hpDirtySkimPm: 333,
  hpDistPm: [1000, 50, 20, 0],
  hpReplanHp: 10,
  exhaustedStill: true,
  distanceLetters: true,
  distanceMaxM: [1400, 1800, 2400],
  distancePm: [-60, -30, 0, 30, 60, 90, 120, 150],
  distanceAirPm: [250, 250, 200, 100],
  distanceRestPm: 250,
  distanceDivePm: 2000,
  // the kick on low hp (owner 2026-11-09, kick-final.md)
  kickHiPm: [150, 0, 0, 0],
  kickLoPm: [0, 0, 0, 0],
  kickPace: false,
  kickPaceMinPm: 0,
  kickReplanFree: true,
  hpKnock: 144,
  hpDoor: 144,
  hpTrafficSq: true,
  hpHitFloor: false,
  airTechRel: true,
  // balance polish (2026-11-09, polish-final.md; probes .work/design7/polish): every great dive
  // keeps 300 m to the line (circuit and steps), the Punta jumps the Saltos of the start on her
  // legs, the bar budgets her plan at her own Resistencia, the dive's η reads her Courage against
  // her build, and a dive is a descent for the descent skills. Measured and left off: a dive room
  // for the tracks with no feature in the final (closerRoomM: the Larga's Remate at 300 rose to
  // 45 %) and the Remate diving from the last feature of the final (closerLastFeature: 0 effect)
  closerRoomMinM: 300,
  diveCourRel: true,
  leadStartJumps: true,
  hpPlanOwn: true,
  diveDescent: true,
  // homes per track (owner 2026-11-09, homes-final.md): Garra fija dives harder from the ceiling
  skillFlight: true,
  // trim (owner 2026-11-09, trim-final.md): Garra fija by distance, less in the Sprint and the Milla
  skillFlightDistance: true,
  // fix (2026-11-10): a skim planned inside a Salto she jumps on her legs is not lost
  jumpHoldsSkim: true,
};

/**
 * Race constants v3 changes over v1 and v2. maxReplans 4 → 6: flights replan.
 * Round 1 brings R8's landing (880 / 60) into stage 1: a flight crosses a jump with no landing,
 * so with today's landing (800 / 120) covering one jump was worth 15-20 m and the lead and pack
 * fell to 5-9 % of the ridge at 300-450. The ground route goes half way (1100 → 1050). Round 2: covering a jump in flight was still worth
 * 8-10 paired metres in the ridge, so a landing keeps 900 ‰ at technique 0 (930 at 600) and the
 * ground route goes to 1025: hover in the ridge at 450 went 30 → 28 %, ground 16-17 → 20 %.
 */
export const RACE: RaceConstants = {
  ...RACE_V1,
  maxReplans: 6,
  landBasePm: 900,
  landTechPm: 60,
  groundDetourMult: 1_025,
};

/**
 * Rival field of v3. Round 2 brought stage 3's rival technique (design §3 R11: 170 → 185 ‰)
 * forward for the two rival classes that fly in stage 1, Picada (closers) and Suspensión (stalks).
 * Round 5 (F10): their agility stays v2's (the owner: agility is the pillar, never the lever to fix
 * a Falconess); the +15 ‰ of technique comes from courage and intelligence (Picada) and from
 * stamina and intelligence (Suspensión). Peregrina is fixed by her own kit (L7). Glide and ground
 * rivals keep v2's rows.
 */
export const FIELD: FieldConstants = {
  ...FIELD_V2,
  rivalWeights: {
    ...FIELD_V2.rivalWeights,
    dive: [250, 180, 185, 210, 175],
    hover: [220, 190, 185, 170, 235],
  },
};
