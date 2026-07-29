import { describe, expect, it } from "vitest";
import {
  boundsFromCoordinates,
  boundsIntersect,
  closeRing,
  multiPolygonArea,
  multiPolygonBounds,
  multiPolygonToSelector,
  normalizeRing,
  openRing,
  ringArea,
  ringSelfIntersects,
  selectorToMultiPolygon,
  signedRingArea,
} from "./polygon";
import type { MultiPolygon } from "./types";

const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
] as [number, number][];

describe("polygon helpers", () => {
  it("opens, closes and normalizes rings", () => {
    expect(closeRing(square)).toHaveLength(5);
    expect(openRing(closeRing(square))).toEqual(square);
    expect(normalizeRing([...square, [0, 10], [0, 0]])).toEqual(square);
    expect(normalizeRing([[0, 0], [1, 1], [2, 2]])).toBeNull();
    expect(closeRing([])).toEqual([]);
    expect(normalizeRing([[0, 0], [10, 0], [Number.NaN, 1]])).toBeNull();
  });

  it("calculates signed area, absolute area and bounds", () => {
    expect(signedRingArea(square)).toBe(100);
    expect(signedRingArea([...square].reverse())).toBe(-100);
    expect(ringArea(square)).toBe(100);
    expect(signedRingArea([[0, 0], [1, 1]])).toBe(0);
    expect(boundsFromCoordinates(square)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });
  });

  it("calculates and compares multipolygon bounds", () => {
    expect(multiPolygonBounds([[square]])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    });
    expect(multiPolygonBounds([])).toBeNull();
    expect(
      boundsIntersect(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 10, minY: 5, maxX: 20, maxY: 15 },
      ),
    ).toBe(true);
    expect(
      boundsIntersect(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 11, minY: 0, maxX: 20, maxY: 10 },
      ),
    ).toBe(false);
  });

  it("detects and rejects self-intersecting rings", () => {
    const crossing = [[0, 0], [6, 6], [0, 6], [6, 0], [8, 3]] as [number, number][];
    expect(ringSelfIntersects(square)).toBe(false);
    expect(ringSelfIntersects(crossing)).toBe(true);
    expect(normalizeRing(crossing)).toBeNull();
  });

  it("subtracts hole areas from multipolygon area", () => {
    const hole = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ] as [number, number][];
    expect(multiPolygonArea([[square, hole]])).toBe(64);
    expect(multiPolygonArea([[]])).toBe(0);
  });

  it("uses POLYGON for one simple ring", () => {
    expect(multiPolygonToSelector([[square]])).toMatchObject({
      type: "POLYGON",
      geometry: { bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
    });
  });

  it("preserves fragments and holes as a MULTIPOLYGON", () => {
    const value: MultiPolygon = [
      [square, [[2, 2], [8, 2], [8, 8], [2, 8]]],
      [[[20, 20], [25, 20], [25, 25], [20, 25]]],
    ];
    const selector = multiPolygonToSelector(value);
    expect(selector?.type).toBe("MULTIPOLYGON");
    expect(selectorToMultiPolygon(selector as unknown as Record<string, unknown>)).toEqual(value);
  });

  it("converts rectangle, ellipse and legacy selectors", () => {
    expect(
      selectorToMultiPolygon({
        type: "RECTANGLE",
        geometry: { x: 1, y: 2, w: 3, h: 4 },
      }),
    ).toEqual([[[[1, 2], [4, 2], [4, 6], [1, 6]]]]);

    const ellipse = selectorToMultiPolygon(
      { type: "ELLIPSE", geometry: { cx: 0, cy: 0, rx: 5, ry: 3 } },
      16,
    );
    expect(ellipse?.[0][0]).toHaveLength(16);

    expect(
      selectorToMultiPolygon({
        type: "SvgSelector",
        value: '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>',
      }),
    ).toEqual([[square]]);

    expect(
      selectorToMultiPolygon({
        type: "FragmentSelector",
        value: "xywh=pixel:-1.5,2e1,3.5,4",
      }),
    ).toEqual([[[[-1.5, 20], [2, 20], [2, 24], [-1.5, 24]]]]);
  });

  it("rejects malformed selectors and coordinates", () => {
    expect(boundsFromCoordinates([])).toBeNull();
    expect(boundsFromCoordinates([[Number.NaN, 0]])).toBeNull();
    expect(selectorToMultiPolygon({ type: "RECTANGLE", geometry: { x: 0 } })).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "RECTANGLE",
        geometry: { x: 0, y: 0, w: -1, h: 2 },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "ELLIPSE",
        geometry: { cx: 0, cy: 0, rx: -1, ry: 2 },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "ELLIPSE",
        geometry: { cx: "x", cy: 0, rx: 1, ry: 2 },
      }),
    ).toBeNull();
    expect(selectorToMultiPolygon({ type: "SvgSelector", value: "invalid" })).toBeNull();
    expect(
      selectorToMultiPolygon({ type: "SvgSelector", value: "<polygon />" }),
    ).toBeNull();
    for (const value of [
      "xywh=percent:1,2,3,4",
      "xywh=pixel:1,2,0,4",
      "xywh=pixel:1,2,-3,4",
      "xywh=pixel:1,2,3,4 trailing",
      "xywh=pixel:NaN,2,3,4",
      123,
    ]) {
      expect(
        selectorToMultiPolygon({ type: "FragmentSelector", value }),
      ).toBeNull();
    }
    expect(selectorToMultiPolygon({})).toBeNull();
    expect(selectorToMultiPolygon(null)).toBeNull();
    expect(selectorToMultiPolygon({ type: "POLYGON", geometry: {} })).toBeNull();
    expect(selectorToMultiPolygon({ type: "MULTIPOLYGON", geometry: {} })).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "MULTIPOLYGON",
        geometry: { polygons: [null] },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "MULTIPOLYGON",
        geometry: { polygons: [{}] },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "MULTIPOLYGON",
        geometry: {
          polygons: [
            { rings: [] },
            {
              rings: [
                { points: [[0, 0], [10, 0], [10, 10], [0, 10]] },
              ],
            },
          ],
        },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "MULTIPOLYGON",
        geometry: { polygons: [{ rings: [null] }] },
      }),
    ).toBeNull();
    expect(
      selectorToMultiPolygon({
        type: "MULTIPOLYGON",
        geometry: { polygons: [{ rings: [{ points: [[0, 0], [1, 1]] }] }] },
      }),
    ).toBeNull();
    expect(selectorToMultiPolygon({ type: "UNKNOWN" })).toBeNull();
    expect(multiPolygonToSelector([])).toBeNull();
  });
});
