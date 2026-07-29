import { afterEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/types/annotation";
import {
  GeoJsonExportError,
  annotationToGeoJsonFeature,
  annotationsToGeoJson,
  downloadAnnotationsAsGeoJson,
  geoJsonFilename,
} from "./geojson";

function annotation(
  id: string,
  selector: Record<string, unknown>,
): Annotation {
  return {
    id,
    type: "Annotation",
    body: [
      { type: "TextualBody", purpose: "tagging", value: "Tumor" },
      { type: "TextualBody", purpose: "commenting", value: "Review" },
      { type: "TextualBody", purpose: "wsi-color", value: "#ff00aa" },
    ],
    target: { selector },
    created: "2026-07-29T00:00:00Z",
    modified: "2026-07-29T00:01:00Z",
    revision: 2,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("annotation GeoJSON export", () => {
  it("converts rectangles into a closed Polygon with annotation metadata", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("rect", {
        type: "RECTANGLE",
        geometry: { x: 10, y: 20, w: 30, h: 40 },
      }),
      "slide.svs",
    );

    expect(feature).toEqual({
      type: "Feature",
      id: "rect",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [10, 20],
          [40, 20],
          [40, 60],
          [10, 60],
          [10, 20],
        ]],
      },
      properties: expect.objectContaining({
        annotation_id: "rect",
        slide_id: "slide.svs",
        label: "Tumor",
        notes: "Review",
        color: "#ff00aa",
        selector_type: "RECTANGLE",
        source_selector: {
          type: "RECTANGLE",
          geometry: { x: 10, y: 20, w: 30, h: 40 },
        },
        revision: 2,
      }),
    });
  });

  it("approximates ellipses as a closed 64-segment Polygon", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("ellipse", {
        type: "ELLIPSE",
        geometry: { cx: 100, cy: 80, rx: 20, ry: 10 },
      }),
      "slide.svs",
    );

    expect(feature.geometry.type).toBe("Polygon");
    if (feature.geometry.type !== "Polygon") throw new Error("Expected Polygon");
    expect(feature.geometry.coordinates[0]).toHaveLength(65);
    expect(feature.geometry.coordinates[0][0][0]).toBeCloseTo(120);
    expect(feature.geometry.coordinates[0][0][1]).toBeCloseTo(80);
    expect(feature.geometry.coordinates[0].at(-1)).toEqual(
      feature.geometry.coordinates[0][0],
    );
  });

  it("exports custom polygons and enforces GeoJSON ring orientation", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("polygon", {
        type: "POLYGON",
        geometry: {
          points: [[0, 0], [0, 10], [10, 10], [10, 0]],
        },
      }),
      "slide.svs",
    );

    expect(feature.geometry).toEqual({
      type: "Polygon",
      coordinates: [[
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
        [10, 0],
      ]],
    });
  });

  it("exports erased shapes with fragments and holes as MultiPolygon", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("multi", {
        type: "MULTIPOLYGON",
        geometry: {
          polygons: [
            {
              rings: [
                { points: [[0, 0], [20, 0], [20, 20], [0, 20]] },
                { points: [[5, 5], [5, 10], [10, 10], [10, 5]] },
              ],
            },
            {
              rings: [
                { points: [[30, 30], [40, 30], [40, 40], [30, 40]] },
              ],
            },
          ],
        },
      }),
      "slide.svs",
    );

    expect(feature.geometry.type).toBe("MultiPolygon");
    if (feature.geometry.type !== "MultiPolygon") {
      throw new Error("Expected MultiPolygon");
    }
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(feature.geometry.coordinates[0]).toHaveLength(2);
    expect(feature.geometry.coordinates[0][0][0]).toEqual(
      feature.geometry.coordinates[0][0].at(-1),
    );
    expect(feature.geometry.coordinates[0][1][0]).toEqual(
      feature.geometry.coordinates[0][1].at(-1),
    );
  });

  it("supports legacy SVG polygon selectors", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("legacy", {
        type: "SvgSelector",
        value: '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>',
      }),
      "slide.svs",
    );

    expect(feature.geometry.type).toBe("Polygon");
  });

  it("supports legacy pixel FragmentSelector rectangles", () => {
    const feature = annotationToGeoJsonFeature(
      annotation("fragment", {
        type: "FragmentSelector",
        value: "xywh=pixel:10,20,30,40",
      }),
      "slide.svs",
    );

    expect(feature.geometry).toEqual({
      type: "Polygon",
      coordinates: [[
        [10, 20],
        [40, 20],
        [40, 60],
        [10, 60],
        [10, 20],
      ]],
    });
  });

  it("throws instead of silently dropping unsupported geometry", () => {
    expect(() =>
      annotationToGeoJsonFeature(
        annotation("bad", { type: "UNKNOWN" }),
        "slide.svs",
      ),
    ).toThrowError(GeoJsonExportError);

    const missingSelector = annotation("missing", {});
    missingSelector.target = {} as Annotation["target"];
    expect(() =>
      annotationToGeoJsonFeature(missingSelector, "slide.svs"),
    ).toThrow("Annotation missing");
  });

  it("creates an empty FeatureCollection with image-coordinate metadata", () => {
    expect(annotationsToGeoJson([], "empty.svs")).toEqual({
      type: "FeatureCollection",
      name: "empty.svs",
      properties: {
        slide_id: "empty.svs",
        coordinate_space: "image-pixel",
        axis_order: "x-right-y-down",
        origin: "top-left",
        units: "pixel",
        export_version: 1,
      },
      features: [],
    });
  });

  it("creates safe and descriptive download filenames", () => {
    expect(geoJsonFilename("Case 01/slide.svs")).toBe(
      "Case_01_slide.svs.annotations.geojson",
    );
    expect(geoJsonFilename("   ")).toBe("annotations.annotations.geojson");
    expect(geoJsonFilename("病例 01.svs")).toBe(
      "病例_01.svs.annotations.geojson",
    );
    expect(geoJsonFilename("../")).toBe("annotations.annotations.geojson");
    expect(geoJsonFilename(".hidden.svs")).toBe(
      "hidden.svs.annotations.geojson",
    );
    expect(geoJsonFilename("\\病例\\")).toBe(
      "病例.annotations.geojson",
    );
    expect(geoJsonFilename("***")).toBe("annotations.annotations.geojson");
  });

  it("downloads a GeoJSON blob and releases its object URL", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return "blob:geojson";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    downloadAnnotationsAsGeoJson(
      [annotation("rect", {
        type: "RECTANGLE",
        geometry: { x: 0, y: 0, w: 10, h: 10 },
      })],
      "slide.svs",
    );

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe(
      "application/geo+json;charset=utf-8",
    );
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:geojson");
    expect(document.querySelector('a[download$=".geojson"]')).toBeNull();
  });
});
