import polygonClipping, { type MultiPolygon as ClippingMultiPolygon } from "polygon-clipping";
import type { MultiPolygon, Point, Ring } from "./types";
import {
  closeRing,
  boundsIntersect,
  multiPolygonBounds,
  multiPolygonArea,
  normalizeMultiPolygon,
} from "./polygon";

const boundsCache = new WeakMap<object, ReturnType<typeof multiPolygonBounds>>();

function cachedBounds(value: MultiPolygon) {
  const cached = boundsCache.get(value);
  if (cached !== undefined) return cached;
  const bounds = multiPolygonBounds(value);
  boundsCache.set(value, bounds);
  return bounds;
}

function circleRing(
  center: Point,
  radius: number,
  segments: number,
): Ring {
  const ring: Ring = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    ring.push([
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
    ]);
  }
  return ring;
}

export function interpolateStroke(points: Point[], maxStep: number): Point[] {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length <= 1 || !Number.isFinite(maxStep) || maxStep <= 0) return finite;
  const result: Point[] = [{ ...finite[0] }];
  for (let i = 1; i < finite.length; i += 1) {
    const start = finite[i - 1];
    const end = finite[i];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(distance / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      result.push({
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      });
    }
  }
  return result;
}

export function buildEraserArea(
  points: Point[],
  radius: number,
  segments = 32,
): MultiPolygon {
  if (!Number.isFinite(radius) || radius <= 0 || segments < 8) return [];
  const samples = interpolateStroke(points, Math.max(radius * 0.75, 0.5));
  if (samples.length === 0) return [];
  const circles = samples.map((point) => [[circleRing(point, radius, segments)]]);
  try {
    return normalizeMultiPolygon(
      polygonClipping.union(
        circles[0] as ClippingMultiPolygon,
        ...(circles.slice(1) as ClippingMultiPolygon[]),
      ) as MultiPolygon,
    );
  } catch {
    /* v8 ignore next -- polygon-clipping failures are converted to an empty safe result */
    return [];
  }
}

function clippingShape(value: MultiPolygon): ClippingMultiPolygon {
  return value.map((polygon) => polygon.map(closeRing)) as ClippingMultiPolygon;
}

export function eraseMultiPolygon(
  source: MultiPolygon,
  eraser: MultiPolygon,
  minimumArea = 100,
): MultiPolygon {
  const normalizedSource = normalizeMultiPolygon(source);
  if (normalizedSource.length === 0 || eraser.length === 0) {
    return normalizedSource;
  }
  const sourceBounds = cachedBounds(source);
  const eraserBounds = cachedBounds(eraser);
  if (!sourceBounds || !eraserBounds || !boundsIntersect(sourceBounds, eraserBounds)) {
    return normalizedSource;
  }
  const normalizedEraser = normalizeMultiPolygon(eraser);
  if (normalizedEraser.length === 0) return normalizedSource;
  try {
    const difference = normalizeMultiPolygon(
      polygonClipping.difference(
        clippingShape(normalizedSource),
        clippingShape(normalizedEraser),
      ) as MultiPolygon,
    );
    return difference.filter((polygon) => multiPolygonArea([polygon]) >= minimumArea);
  } catch {
    /* v8 ignore next -- invalid third-party geometry must leave the source untouched */
    return normalizedSource;
  }
}
