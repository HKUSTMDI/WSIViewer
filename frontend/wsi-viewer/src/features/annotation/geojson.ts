import type { Annotation } from "@/types/annotation";
import {
  closeRing,
  selectorToMultiPolygon,
  signedRingArea,
} from "./geometry/polygon";
import type {
  Coordinate,
  MultiPolygon,
  Ring,
} from "./geometry/types";
import { getAnnotationFields } from "./body";

export type GeoJsonPolygonGeometry = {
  type: "Polygon";
  coordinates: Coordinate[][];
};

export type GeoJsonMultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: Coordinate[][][];
};

export interface AnnotationGeoJsonFeature {
  type: "Feature";
  id: string;
  geometry: GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry;
  properties: {
    annotation_id: string;
    slide_id: string;
    label: string;
    notes: string;
    color: string;
    body: Annotation["body"];
    selector_type: string | null;
    source_selector: Annotation["target"]["selector"];
    revision: number;
    created: string;
    modified: string;
  };
}

export interface AnnotationGeoJsonFeatureCollection {
  type: "FeatureCollection";
  name: string;
  properties: {
    slide_id: string;
    coordinate_space: "image-pixel";
    axis_order: "x-right-y-down";
    origin: "top-left";
    units: "pixel";
    export_version: 1;
  };
  features: AnnotationGeoJsonFeature[];
}

export class GeoJsonExportError extends Error {
  readonly annotationId: string;

  constructor(annotationId: string) {
    super(`Annotation ${annotationId} has unsupported or invalid geometry`);
    this.name = "GeoJsonExportError";
    this.annotationId = annotationId;
  }
}

function orientRing(ring: Ring, counterClockwise: boolean): Ring {
  const shouldReverse =
    (signedRingArea(ring) > 0) !== counterClockwise;
  return closeRing(shouldReverse ? [...ring].reverse() : ring);
}

function geoJsonPolygon(polygon: MultiPolygon[number]): Coordinate[][] {
  return polygon.map((ring, index) => orientRing(ring, index === 0));
}

function geometryFromMultiPolygon(
  value: MultiPolygon,
): GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry {
  if (value.length === 1) {
    return {
      type: "Polygon",
      coordinates: geoJsonPolygon(value[0]),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: value.map(geoJsonPolygon),
  };
}

export function annotationToGeoJsonFeature(
  annotation: Annotation,
  slideId: string,
): AnnotationGeoJsonFeature {
  const selector = annotation.target?.selector;
  const polygons = selectorToMultiPolygon(selector);
  if (!polygons || !selector || typeof selector !== "object") {
    throw new GeoJsonExportError(annotation.id);
  }
  const fields = getAnnotationFields(annotation.body);

  return {
    type: "Feature",
    id: annotation.id,
    geometry: geometryFromMultiPolygon(polygons),
    properties: {
      annotation_id: annotation.id,
      slide_id: slideId,
      label: fields.label,
      notes: fields.notes,
      color: fields.color,
      body: annotation.body,
      selector_type:
        typeof selector.type === "string" ? selector.type : null,
      source_selector: selector,
      revision: annotation.revision,
      created: annotation.created,
      modified: annotation.modified,
    },
  };
}

export function annotationsToGeoJson(
  annotations: Annotation[],
  slideId: string,
): AnnotationGeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    name: slideId,
    properties: {
      slide_id: slideId,
      coordinate_space: "image-pixel",
      axis_order: "x-right-y-down",
      origin: "top-left",
      units: "pixel",
      export_version: 1,
    },
    features: annotations.map((annotation) =>
      annotationToGeoJsonFeature(annotation, slideId),
    ),
  };
}

export function geoJsonFilename(slideId: string): string {
  const safeName = slideId
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return `${safeName || "annotations"}.annotations.geojson`;
}

export function downloadAnnotationsAsGeoJson(
  annotations: Annotation[],
  slideId: string,
) {
  const collection = annotationsToGeoJson(annotations, slideId);
  const blob = new Blob(
    [JSON.stringify(collection, null, 2)],
    { type: "application/geo+json;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = geoJsonFilename(slideId);
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
