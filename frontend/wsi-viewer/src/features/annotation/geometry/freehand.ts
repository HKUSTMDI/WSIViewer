import type { Point } from "./types";
import { multiPolygonToSelector } from "./polygon";

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + position * dx),
    point.y - (start.y + position * dy),
  );
}

export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  let maxDistance = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  if (maxDistance > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [{ ...points[0] }, { ...points[points.length - 1] }];
}

export function shouldAppendSample(previous: Point | undefined, next: Point, minDistance = 5): boolean {
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return false;
  if (!previous) return true;
  return Math.hypot(next.x - previous.x, next.y - previous.y) >= minDistance;
}

export function buildFreehandSelector(
  points: Point[],
  tolerance: number,
  maxPoints = 500,
) {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length < 3) return null;
  let simplified = simplifyPath(finite, Math.max(0, tolerance));
  if (simplified.length > maxPoints) {
    simplified = simplifyPath(simplified, Math.max(1, tolerance * 2));
  }
  if (simplified.length < 3) return null;
  return multiPolygonToSelector([[
    simplified.map((point) => [Math.round(point.x), Math.round(point.y)]),
  ]]);
}
