/**
 * How many tokens an image costs a vision model — a port of the reference
 * resize in Anthropic's vision docs ("How Claude resizes and pads images").
 *
 * An image is cut into 28×28-pixel patches; each patch is one visual token.
 * Too-large images are first shrunk (aspect preserved) to the largest size
 * that fits both the model's edge limit and its visual-token budget.
 */

export const PATCH_PX = 28;

export interface ImageLimits {
  /** Neither side may exceed this, measured on the patch-padded size. */
  maxEdge: number;
  /** Visual-token budget per image. */
  maxTokens: number;
}

/** Current Claude models (4.7 and later) — the high-resolution tier. */
export const HIGH_RES_LIMITS: ImageLimits = { maxEdge: 2576, maxTokens: 4784 };

/** Every other model in the docs' table — the standard tier. */
export const STANDARD_LIMITS: ImageLimits = { maxEdge: 1568, maxTokens: 1568 };

export function countImageTokens(width: number, height: number): number {
  return Math.ceil(width / PATCH_PX) * Math.ceil(height / PATCH_PX);
}

/** Round half to even — the reference code's tie rule ("matches the live API at exact .5 ties"). */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function fits(width: number, height: number, limits: ImageLimits): boolean {
  return (
    Math.ceil(width / PATCH_PX) * PATCH_PX <= limits.maxEdge &&
    Math.ceil(height / PATCH_PX) * PATCH_PX <= limits.maxEdge &&
    countImageTokens(width, height) <= limits.maxTokens
  );
}

/** The size the model actually sees: unchanged if it fits, else the largest fitting downscale. */
export function resizedSize(
  width: number,
  height: number,
  limits: ImageLimits,
): { width: number; height: number } {
  if (fits(width, height, limits)) return { width, height };
  if (height > width) {
    const swapped = resizedSize(height, width, limits);
    return { width: swapped.height, height: swapped.width };
  }
  // Binary search on the long edge: lo always fits, hi never does.
  const aspect = width / height;
  const shortFor = (long: number) => Math.max(roundHalfEven(long / aspect), 1);
  let lo = 1;
  let hi = width;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, shortFor(mid), limits)) lo = mid;
    else hi = mid;
  }
  return { width: lo, height: shortFor(lo) };
}

export interface ImageCost {
  resized: boolean;
  width: number;
  height: number;
  /** Patch grid the model sees (the last row/column is padded). */
  cols: number;
  rows: number;
  tokens: number;
}

export function imageCost(width: number, height: number, limits: ImageLimits = HIGH_RES_LIMITS): ImageCost {
  const size = resizedSize(width, height, limits);
  const cols = Math.ceil(size.width / PATCH_PX);
  const rows = Math.ceil(size.height / PATCH_PX);
  return {
    resized: size.width !== width || size.height !== height,
    width: size.width,
    height: size.height,
    cols,
    rows,
    tokens: cols * rows,
  };
}
