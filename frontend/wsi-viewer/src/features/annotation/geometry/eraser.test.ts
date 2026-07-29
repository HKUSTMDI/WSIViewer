import fc from "fast-check";
import polygonClipping from "polygon-clipping";
import { describe, expect, it, vi } from "vitest";
import { buildEraserArea, eraseMultiPolygon, interpolateStroke } from "./eraser";
import { multiPolygonArea } from "./polygon";
import type { MultiPolygon } from "./types";

function rectangle(x: number, y: number, width: number, height: number): MultiPolygon {
  return [[[
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]]];
}

describe("eraser geometry", () => {
  it("interpolates long pointer jumps into a continuous stroke", () => {
    const points = interpolateStroke([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    expect(points).toHaveLength(11);
    expect(points[5]).toEqual({ x: 50, y: 0 });
  });

  it("handles invalid and empty stroke inputs safely", () => {
    expect(interpolateStroke([], 10)).toEqual([]);
    expect(interpolateStroke([{ x: 1, y: 2 }], 0)).toEqual([{ x: 1, y: 2 }]);
    expect(
      interpolateStroke([{ x: Number.NaN, y: 0 }, { x: 2, y: 3 }], 10),
    ).toEqual([{ x: 2, y: 3 }]);
    expect(buildEraserArea([{ x: 0, y: 0 }], 0)).toEqual([]);
    expect(buildEraserArea([{ x: 0, y: 0 }], 1, 7)).toEqual([]);
    expect(buildEraserArea([{ x: Number.NaN, y: 0 }], 1)).toEqual([]);
  });

  it("fails safely when the clipping library rejects an eraser union", () => {
    vi.spyOn(polygonClipping, "union").mockImplementationOnce(() => {
      throw new Error("invalid union");
    });
    expect(buildEraserArea([{ x: 0, y: 0 }], 1)).toEqual([]);
  });

  it("leaves an annotation unchanged when the eraser misses", () => {
    const source = rectangle(0, 0, 100, 100);
    const eraser = buildEraserArea([{ x: 200, y: 200 }], 10);
    expect(eraseMultiPolygon(source, eraser, 0)).toEqual(source);
  });

  it("fully deletes an annotation", () => {
    const source = rectangle(0, 0, 10, 10);
    const eraser = buildEraserArea([{ x: 5, y: 5 }], 20);
    expect(eraseMultiPolygon(source, eraser, 0)).toEqual([]);
  });

  it("returns normalized source for an empty eraser or source", () => {
    const source = rectangle(0, 0, 10, 10);
    expect(eraseMultiPolygon(source, [], 0)).toEqual(source);
    expect(eraseMultiPolygon([], buildEraserArea([{ x: 0, y: 0 }], 1), 0)).toEqual([]);
  });

  it("keeps the source when the clipping library rejects a difference", () => {
    const source = rectangle(0, 0, 10, 10);
    const eraser = buildEraserArea([{ x: 5, y: 5 }], 1);
    vi.spyOn(polygonClipping, "difference").mockImplementationOnce(() => {
      throw new Error("invalid difference");
    });
    expect(eraseMultiPolygon(source, eraser, 0)).toEqual(source);
  });

  it("drops result fragments below the configured area threshold", () => {
    const source = rectangle(0, 0, 10, 10);
    const eraser = buildEraserArea([{ x: 5, y: 5 }], 1);
    expect(eraseMultiPolygon(source, eraser, 101)).toEqual([]);
  });

  it("preserves an internal hole", () => {
    const source = rectangle(0, 0, 100, 100);
    const eraser = buildEraserArea([{ x: 50, y: 50 }], 10);
    const result = eraseMultiPolygon(source, eraser, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(multiPolygonArea(result)).toBeLessThan(10_000);
  });

  it("splits a polygon when a stroke passes through it", () => {
    const source = rectangle(0, 0, 100, 100);
    const eraser = buildEraserArea(
      [{ x: 50, y: -20 }, { x: 50, y: 120 }],
      5,
    );
    const result = eraseMultiPolygon(source, eraser, 0);
    expect(result).toHaveLength(2);
  });

  it("does not leave a gap at the midpoint of a fast stroke", () => {
    const source = rectangle(48, -2, 4, 4);
    const eraser = buildEraserArea([{ x: 0, y: 0 }, { x: 100, y: 0 }], 5);
    expect(eraseMultiPolygon(source, eraser, 0)).toEqual([]);
  });

  it("never increases rectangle area for randomized eraser strokes", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 500, noNaN: true }),
        fc.double({ min: 10, max: 500, noNaN: true }),
        fc.double({ min: -100, max: 600, noNaN: true }),
        fc.double({ min: -100, max: 600, noNaN: true }),
        fc.double({ min: 0.5, max: 50, noNaN: true }),
        (width, height, x, y, radius) => {
          const source = rectangle(0, 0, width, height);
          const result = eraseMultiPolygon(
            source,
            buildEraserArea([{ x, y }], radius),
            0,
          );
          const area = multiPolygonArea(result);
          expect(Number.isFinite(area)).toBe(true);
          expect(area).toBeGreaterThanOrEqual(0);
          expect(area).toBeLessThanOrEqual(width * height + 1e-5);
        },
      ),
      { numRuns: 1_000, seed: 20_260_716 },
    );
  });
});
