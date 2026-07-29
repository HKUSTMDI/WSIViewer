import type {
  Bounds,
  Coordinate,
  MultiPolygon,
  NativeAreaSelector,
  Polygon,
  PolygonElement,
  Ring,
} from "./types";

export const GEOMETRY_EPSILON = 1e-6;

export function isFiniteCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function coordinatesEqual(
  a: Coordinate,
  b: Coordinate,
  epsilon = GEOMETRY_EPSILON,
): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function openRing(ring: Ring): Ring {
  if (ring.length > 1 && coordinatesEqual(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }
  return [...ring];
}

export function closeRing(ring: Ring): Ring {
  const open = openRing(ring);
  if (open.length === 0) return [];
  return [...open, [...open[0]] as Coordinate];
}

export function signedRingArea(ring: Ring): number {
  const points = openRing(ring);
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    area += points[i][0] * points[next][1] - points[next][0] * points[i][1];
  }
  return area / 2;
}

export function ringArea(ring: Ring): number {
  return Math.abs(signedRingArea(ring));
}

function cross(a: Coordinate, b: Coordinate, c: Coordinate): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): boolean {
  return (
    Math.abs(cross(start, end, point)) <= GEOMETRY_EPSILON &&
    point[0] >= Math.min(start[0], end[0]) - GEOMETRY_EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + GEOMETRY_EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - GEOMETRY_EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(
  a: Coordinate,
  b: Coordinate,
  c: Coordinate,
  d: Coordinate,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true;
  }
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  );
}

export function ringSelfIntersects(ring: Ring): boolean {
  const points = openRing(ring);
  if (points.length < 4) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function boundsFromCoordinates(points: Coordinate[]): Bounds | null {
  if (points.length === 0 || points.some((point) => !isFiniteCoordinate(point))) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export function multiPolygonBounds(value: MultiPolygon): Bounds | null {
  return boundsFromCoordinates(
    value.flatMap((polygon) => polygon[0] ?? []),
  );
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

export function normalizeRing(ring: Ring): Ring | null {
  const result: Ring = [];
  for (const point of openRing(ring)) {
    if (!isFiniteCoordinate(point)) return null;
    if (result.length === 0 || !coordinatesEqual(result[result.length - 1], point)) {
      result.push([point[0], point[1]]);
    }
  }
  if (
    result.length < 3 ||
    ringArea(result) <= GEOMETRY_EPSILON ||
    ringSelfIntersects(result)
  ) {
    return null;
  }
  return result;
}

export function normalizeMultiPolygon(value: MultiPolygon): MultiPolygon {
  const result: MultiPolygon = [];
  for (const polygon of value) {
    const rings = polygon
      .map(normalizeRing)
      .filter((ring): ring is Ring => ring !== null);
    if (rings.length > 0) result.push(rings);
  }
  return result;
}

export function multiPolygonArea(value: MultiPolygon): number {
  return value.reduce((total, polygon) => {
    if (polygon.length === 0) return total;
    const [outer, ...holes] = polygon;
    return total + ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);
  }, 0);
}

function polygonElement(rings: Polygon): PolygonElement | null {
  const normalized = rings
    .map(normalizeRing)
    .filter((ring): ring is Ring => ring !== null);
  if (normalized.length === 0) return null;
  const bounds = boundsFromCoordinates(normalized[0]);
  if (!bounds) return null;
  return {
    rings: normalized.map((points) => ({ points })),
    bounds,
  };
}

export function multiPolygonToSelector(value: MultiPolygon): NativeAreaSelector | null {
  const polygons = normalizeMultiPolygon(value)
    .map(polygonElement)
    .filter((polygon): polygon is PolygonElement => polygon !== null);
  if (polygons.length === 0) return null;

  if (polygons.length === 1 && polygons[0].rings.length === 1) {
    return {
      type: "POLYGON",
      geometry: {
        points: polygons[0].rings[0].points,
        bounds: polygons[0].bounds,
      },
    };
  }

  const bounds = boundsFromCoordinates(polygons.flatMap((polygon) => polygon.rings[0].points));
  if (!bounds) return null;
  return {
    type: "MULTIPOLYGON",
    geometry: { polygons, bounds },
  };
}

function rectangleToPolygon(geometry: Record<string, unknown>): MultiPolygon | null {
  const { x, y, w, h } = geometry;
  if (![x, y, w, h].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }
  const rx = x as number;
  const ry = y as number;
  const rw = w as number;
  const rh = h as number;
  if (rw <= 0 || rh <= 0) return null;
  return [[[
    [rx, ry],
    [rx + rw, ry],
    [rx + rw, ry + rh],
    [rx, ry + rh],
  ]]];
}

function ellipseToPolygon(
  geometry: Record<string, unknown>,
  segments: number,
): MultiPolygon | null {
  const { cx, cy, rx, ry } = geometry;
  if (![cx, cy, rx, ry].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return null;
  }
  const radiusX = rx as number;
  const radiusY = ry as number;
  if (radiusX <= 0 || radiusY <= 0) return null;
  const ring: Ring = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    ring.push([
      (cx as number) + radiusX * Math.cos(angle),
      (cy as number) + radiusY * Math.sin(angle),
    ]);
  }
  return [[ring]];
}

function legacySvgPolygon(value: unknown): MultiPolygon | null {
  if (typeof value !== "string" || !value.includes("<polygon")) return null;
  const match = value.match(/points=["']([^"']+)["']/);
  if (!match) return null;
  const ring = match[1]
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as Coordinate);
  const normalized = normalizeRing(ring);
  return normalized ? [[normalized]] : null;
}

function fragmentRectangle(value: unknown): MultiPolygon | null {
  if (typeof value !== "string") return null;
  const number = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
  const match = value.match(
    new RegExp(`^xywh=pixel:(${number}),(${number}),(${number}),(${number})$`),
  );
  if (!match) return null;
  const [x, y, w, h] = match.slice(1).map(Number);
  return rectangleToPolygon({ x, y, w, h });
}

export function selectorToMultiPolygon(
  selector: unknown,
  ellipseSegments = 64,
): MultiPolygon | null {
  if (!selector || typeof selector !== "object") return null;
  const candidate = selector as Record<string, unknown>;
  const type = candidate.type;
  const geometry = candidate.geometry;
  if (typeof type !== "string") return null;

  if (type === "POLYGON" && geometry && typeof geometry === "object") {
    const points = (geometry as { points?: unknown }).points;
    if (!Array.isArray(points)) return null;
    const ring = normalizeRing(points as Coordinate[]);
    return ring ? [[ring]] : null;
  }

  if (type === "MULTIPOLYGON" && geometry && typeof geometry === "object") {
    const polygons = (geometry as { polygons?: unknown }).polygons;
    if (!Array.isArray(polygons)) return null;
    const value: MultiPolygon = [];
    for (const polygon of polygons) {
      if (!polygon || typeof polygon !== "object") return null;
      const rings = (polygon as { rings?: unknown }).rings;
      if (!Array.isArray(rings) || rings.length === 0) return null;
      const parsed: Ring[] = [];
      for (const ring of rings) {
        const points = ring && typeof ring === "object"
          ? (ring as { points?: unknown }).points
          : undefined;
        if (!Array.isArray(points)) return null;
        const normalized = normalizeRing(points as Coordinate[]);
        if (!normalized) return null;
        parsed.push(normalized);
      }
      if (parsed.length > 0) value.push(parsed);
    }
    const normalized = normalizeMultiPolygon(value);
    return normalized.length > 0 ? normalized : null;
  }

  if (type === "RECTANGLE" && geometry && typeof geometry === "object") {
    return rectangleToPolygon(geometry as Record<string, unknown>);
  }
  if (type === "ELLIPSE" && geometry && typeof geometry === "object") {
    return ellipseToPolygon(geometry as Record<string, unknown>, ellipseSegments);
  }
  if (type === "FragmentSelector") return fragmentRectangle(candidate.value);
  if (type === "SvgSelector") return legacySvgPolygon(candidate.value);
  return null;
}
