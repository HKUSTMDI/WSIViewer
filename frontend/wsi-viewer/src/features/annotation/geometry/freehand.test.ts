import { describe, expect, it } from "vitest";
import { buildFreehandSelector, shouldAppendSample, simplifyPath } from "./freehand";

describe("freehand geometry", () => {
  it("simplifies a path while preserving meaningful corners", () => {
    const result = simplifyPath(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0.1 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      0.5,
    );
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("filters overly close and non-finite samples", () => {
    expect(shouldAppendSample(undefined, { x: 0, y: 0 })).toBe(true);
    expect(shouldAppendSample({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
    expect(shouldAppendSample({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    expect(shouldAppendSample(undefined, { x: Number.NaN, y: 0 })).toBe(false);
  });

  it("builds a rounded native polygon selector", () => {
    const selector = buildFreehandSelector(
      [
        { x: 0.2, y: 0.1 },
        { x: 10.4, y: 0.2 },
        { x: 10.2, y: 10.4 },
        { x: 0.1, y: 10.2 },
      ],
      0,
    );
    expect(selector).toMatchObject({
      type: "POLYGON",
      geometry: {
        points: [[0, 0], [10, 0], [10, 10], [0, 10]],
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      },
    });
  });

  it("rejects short, collinear and non-finite paths", () => {
    expect(buildFreehandSelector([{ x: 0, y: 0 }], 1)).toBeNull();
    expect(
      buildFreehandSelector(
        [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }],
        0,
      ),
    ).toBeNull();
    expect(
      buildFreehandSelector(
        [{ x: Number.NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }],
        0,
      ),
    ).toBeNull();
  });

  it("applies a second simplification pass when the point budget is exceeded", () => {
    const selector = buildFreehandSelector(
      [
        { x: 0, y: 0 },
        { x: 5, y: -1 },
        { x: 10, y: 0 },
        { x: 11, y: 5 },
        { x: 10, y: 10 },
        { x: 5, y: 11 },
        { x: 0, y: 10 },
      ],
      0,
      4,
    );
    expect(selector).not.toBeNull();
  });

  it("handles coincident simplification endpoints", () => {
    expect(
      simplifyPath(
        [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 0 }],
        1,
      ),
    ).toHaveLength(3);
  });
});
