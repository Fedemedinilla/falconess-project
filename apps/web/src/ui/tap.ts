/**
 * One gesture, one decision (owner rule F50, F27): the second click of a double tap lands on
 * whatever the first one mounted under the finger (the next week's button, the layer that follows
 * the week's effects, a training's result), so every button that advances or commits ignores it.
 * `taps` is how many clicks of a run count: the training card takes two (a tap chooses, a second
 * one trains), so only its third is a repeat. A key press is no repeat (its `detail` is 0).
 */
export function isRepeatTap(e: { readonly detail: number }, taps = 1): boolean {
  return e.detail > taps;
}
