import { describe, expect, it } from "vitest";
import { angleDeg, pointsToDistance } from "./measurement";

const origin = { x: 0, y: 0 };

describe("measurement helpers", () => {
  it("computes angles in physical space when X/Y MPP differ", () => {
    expect(
      angleDeg(
        { x: 1, y: 0 },
        origin,
        { x: 1, y: 1 },
        { mpp_x: 1, mpp_y: 2, objective_power: 40 },
      ),
    ).toBeCloseTo(63.4349, 4);
  });

  it("keeps pixel-space angles when complete MPP metadata is unavailable", () => {
    expect(angleDeg({ x: 1, y: 0 }, origin, { x: 1, y: 1 })).toBeCloseTo(
      45,
    );
    expect(
      angleDeg(
        { x: 1, y: 0 },
        origin,
        { x: 1, y: 1 },
        { mpp_x: 1, mpp_y: null, objective_power: null },
      ),
    ).toBeCloseTo(45);
  });

  it("uses both MPP axes for physical distances", () => {
    expect(
      pointsToDistance(
        origin,
        { x: 3, y: 4 },
        { mpp_x: 2, mpp_y: 1, objective_power: null },
      ),
    ).toBe("7.2 μm");
  });
});
