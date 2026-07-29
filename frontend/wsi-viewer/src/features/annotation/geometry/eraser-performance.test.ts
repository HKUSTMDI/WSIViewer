import { describe, expect, it } from "vitest";
import { buildEraserArea, eraseMultiPolygon } from "./eraser";
import type { MultiPolygon } from "./types";

function rectangle(x: number, y: number): MultiPolygon {
  return [[[
    [x, y],
    [x + 20, y],
    [x + 20, y + 20],
    [x, y + 20],
  ]]];
}

describe("eraser performance guard", () => {
  it("processes 1,000 annotations within the interaction budget", () => {
    const annotations = Array.from({ length: 1_000 }, (_, index) =>
      rectangle((index % 50) * 30, Math.floor(index / 50) * 30),
    );
    const eraser = buildEraserArea(
      [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      10,
    );
    const start = performance.now();
    const results = annotations.map((annotation) =>
      eraseMultiPolygon(annotation, eraser, 0),
    );
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(1_000);
    expect(elapsed).toBeLessThan(2_000);
  });
});
