import type { TrainingArt } from "./art";

/** Where a scene goes: px box of the image inside the screen. */
type Placement = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Cover the screen (`box`) with the image, then shift it so her face lands at `target` (the middle
 * of the stage), without ever uncovering an edge. When the shift alone cannot reach the target the
 * image grows (up to 1.5 × cover) until it can: her face is never under the top bar.
 */
export function placeScene(
  art: Pick<TrainingArt, "w" | "h" | "fx" | "fy">,
  box: { readonly width: number; readonly height: number },
  target: { readonly x: number; readonly y: number },
): Placement {
  const cover = Math.max(box.width / art.w, box.height / art.h);
  // the face must be able to sit at the target: below it there must be enough image to cover
  const needY = target.y / (art.fy * art.h);
  const needBelow = (box.height - target.y) / ((1 - art.fy) * art.h);
  const scale = Math.min(cover * 1.5, Math.max(cover, needY, needBelow));
  const width = art.w * scale;
  const height = art.h * scale;
  const clamp = (v: number, min: number) => Math.min(0, Math.max(min, v));
  return {
    width,
    height,
    left: clamp(target.x - art.fx * width, box.width - width),
    top: clamp(target.y - art.fy * height, box.height - height),
  };
}
