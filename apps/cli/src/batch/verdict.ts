import type { BalanceTarget, BalanceVerdict } from "@falconess/schema";
import type { Interval } from "./stats.js";

/**
 * §25.2.1: pass when the 95 % interval lies inside the target (bounds inclusive; for a one-sided
 * target only its bound counts), fail when it lies entirely outside, inconclusive otherwise.
 * A `null` interval bound is unbounded.
 */
export function cellVerdict(interval: Interval, target: BalanceTarget): BalanceVerdict {
  const lo = interval.lo ?? Number.NEGATIVE_INFINITY;
  const hi = interval.hi ?? Number.POSITIVE_INFINITY;
  const min = target.min ?? Number.NEGATIVE_INFINITY;
  const max = target.max ?? Number.POSITIVE_INFINITY;
  if (hi < min || lo > max) return "fail";
  if (lo >= min && hi <= max) return "pass";
  return "inconclusive";
}

/**
 * §25.2.1 (revision 4): a metric passes only if every cell passes and fails if any cell fails;
 * otherwise it is inconclusive. The same rule combines metrics into the report verdict. An empty
 * list is inconclusive (nothing was measured).
 */
export function combineVerdicts(verdicts: readonly BalanceVerdict[]): BalanceVerdict {
  if (verdicts.length === 0) return "inconclusive";
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.every((v) => v === "pass")) return "pass";
  return "inconclusive";
}
