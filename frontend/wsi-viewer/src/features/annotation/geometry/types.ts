export interface Point {
  x: number;
  y: number;
}

export type Coordinate = [number, number];
export type Ring = Coordinate[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PolygonElement {
  rings: Array<{ points: Coordinate[] }>;
  bounds: Bounds;
}

export interface PolygonSelector extends Record<string, unknown> {
  type: "POLYGON";
  geometry: {
    points: Coordinate[];
    bounds: Bounds;
  };
}

export interface MultiPolygonSelector extends Record<string, unknown> {
  type: "MULTIPOLYGON";
  geometry: {
    polygons: PolygonElement[];
    bounds: Bounds;
  };
}

export type NativeAreaSelector = PolygonSelector | MultiPolygonSelector;
