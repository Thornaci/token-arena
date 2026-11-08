import { describe, expect, it } from 'vitest';
import {
  HIGH_RES_LIMITS,
  STANDARD_LIMITS,
  countImageTokens,
  imageCost,
  resizedSize,
} from '@/engine/imageTokens';

// Every row below is quoted from Anthropic's vision docs (fetched 2026-11-06):
// the "Resolution and token cost" table and the vision-coordinates example.
describe('image tokens match the published table (high-resolution tier)', () => {
  const rows: [number, number, number, number, number][] = [
    // width, height → resized width, resized height, tokens
    [200, 200, 200, 200, 64],
    [1000, 1000, 1000, 1000, 1296],
    [1092, 1092, 1092, 1092, 1521],
    [1920, 1080, 1920, 1080, 2691],
    [2000, 1500, 2000, 1500, 3888],
    [3840, 2160, 2576, 1449, 4784],
    [1075, 1520, 1075, 1520, 2145],
  ];
  for (const [w, h, rw, rh, tokens] of rows) {
    it(`${w}×${h} → ${rw}×${rh}, ${tokens} tokens`, () => {
      const cost = imageCost(w, h, HIGH_RES_LIMITS);
      expect([cost.width, cost.height]).toEqual([rw, rh]);
      expect(cost.tokens).toBe(tokens);
      expect(cost.resized).toBe(rw !== w || rh !== h);
    });
  }
});

describe('standard tier rows', () => {
  it('downsizes like the docs', () => {
    expect(resizedSize(1920, 1080, STANDARD_LIMITS)).toEqual({ width: 1456, height: 819 });
    expect(resizedSize(3840, 2160, STANDARD_LIMITS)).toEqual({ width: 1456, height: 819 });
    expect(countImageTokens(1456, 819)).toBe(1560);
    // Portrait goes through the swap branch.
    expect(resizedSize(1075, 1520, STANDARD_LIMITS)).toEqual({ width: 924, height: 1307 });
    // Not asserted: the table's 2000×1500 → 1269×952. The page's own reference
    // code (run verbatim in Python) returns 1270×952 — 1270 / (4/3) is an exact
    // .5 tie that rounds half-to-even to 952, and 46×34 = 1564 still fits.
  });
});

describe('resize invariants', () => {
  it('never exceeds either limit and keeps the aspect ratio', () => {
    for (const [w, h] of [[4032, 3024], [2880, 1800], [1170, 2532], [8000, 500], [500, 8000]] as const) {
      const cost = imageCost(w, h, HIGH_RES_LIMITS);
      expect(cost.tokens).toBeLessThanOrEqual(HIGH_RES_LIMITS.maxTokens);
      expect(cost.cols * 28).toBeLessThanOrEqual(HIGH_RES_LIMITS.maxEdge);
      expect(cost.rows * 28).toBeLessThanOrEqual(HIGH_RES_LIMITS.maxEdge);
      expect(Math.abs(cost.width / cost.height - w / h) / (w / h)).toBeLessThan(0.01);
    }
  });

  it('picks the LARGEST fitting size: one pixel wider would not fit', () => {
    const cost = imageCost(4032, 3024, HIGH_RES_LIMITS);
    expect([cost.width, cost.height, cost.tokens]).toEqual([2212, 1659, 4740]);
    const wider = cost.width + 1;
    expect(countImageTokens(wider, Math.round(wider * 0.75))).toBeGreaterThan(4784);
  });
});
