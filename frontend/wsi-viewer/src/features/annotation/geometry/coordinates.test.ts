import { describe, expect, it } from "vitest";
import { clientToLocalPoint, imagePixelsPerScreenPixel } from "./coordinates";

describe("coordinate helpers", () => {
  it("converts browser coordinates into local coordinates", () => {
    expect(clientToLocalPoint(120, 90, { left: 20, top: 10 })).toEqual({
      x: 100,
      y: 80,
    });
  });

  it("rejects non-finite coordinates", () => {
    expect(clientToLocalPoint(Number.NaN, 1, { left: 0, top: 0 })).toBeNull();
  });

  it("calculates image pixels represented by one screen pixel", () => {
    expect(imagePixelsPerScreenPixel(0.5, 10_000, 1_000)).toBe(5);
    expect(imagePixelsPerScreenPixel(0, 10_000, 1_000)).toBeNull();
    expect(imagePixelsPerScreenPixel(1, 10_000, 0)).toBeNull();
  });
});
