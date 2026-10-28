import type { ContentIndex, RunInput, SeasonState } from "@falconess/schema";

/**
 * A deterministic policy that walks many paths of the season reducer: every training kind (so
 * high fatigue, forced rests in v1 and risk-flight injuries happen), rests, outings, workshop
 * repairs and frame swaps, and every option of the events it meets. A pure function of the state
 * and the content, written only against APIs that predate ruleset v2, so the v1 invariance test
 * (ADR-0006) can replay it at an older commit and compare digests.
 */
export function mixedPolicy(content: ContentIndex, s: SeasonState): RunInput {
  if (s.pendingEvent) {
    const n = content.getEvent(s.pendingEvent.eventId).options.length;
    return { kind: "event:choose", option: (s.turn + s.inputsApplied) % n };
  }
  switch ((s.turn * 7 + s.inputsApplied * 3) % 11) {
    case 0:
      return { kind: "train:agility" };
    case 1:
      return { kind: "train:stamina" };
    case 2:
      return { kind: "train:technique" };
    case 3:
      return { kind: "train:risk-flight" };
    case 4:
      return { kind: "train:simulator" };
    case 5:
      return { kind: "rest" };
    case 6:
      return { kind: "outing" };
    case 7:
      return { kind: "workshop", ops: [{ op: "repair" }] };
    case 8: {
      const i = s.hangar.indexOf(s.equippedFrame);
      const next = s.hangar[(i + 1) % s.hangar.length] ?? s.equippedFrame;
      return { kind: "workshop", ops: [{ op: "equip-frame", frameId: next }] };
    }
    case 9:
      return { kind: "train:technique" };
    default:
      return { kind: "train:agility" };
  }
}
