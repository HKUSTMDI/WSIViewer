import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNOTATION_COLOR,
  buildAnnotationBody,
  getAnnotationColor,
  getAnnotationFields,
  getAnnotationLabel,
  normalizeAnnotationColor,
} from "./body";

describe("annotation body fields", () => {
  it("reads modern label, notes and color bodies", () => {
    const body = [
      { type: "TextualBody", purpose: "tagging", value: "Tumor" },
      { type: "TextualBody", purpose: "commenting", value: "High grade" },
      { type: "TextualBody", purpose: "wsi-color", value: "#FF00AA" },
    ];

    expect(getAnnotationFields(body)).toEqual({
      label: "Tumor",
      notes: "High grade",
      color: "#ff00aa",
    });
  });

  it("treats a legacy commenting body as the label", () => {
    const body = {
      type: "TextualBody",
      purpose: "commenting",
      value: "Legacy label",
    };

    expect(getAnnotationFields(body)).toEqual({
      label: "Legacy label",
      notes: "",
      color: DEFAULT_ANNOTATION_COLOR,
    });
  });

  it("falls back to Untitled and the default color for missing or invalid bodies", () => {
    expect(getAnnotationLabel([])).toBe("Untitled");
    expect(getAnnotationLabel({ purpose: "tagging", value: "  " })).toBe(
      "Untitled",
    );
    expect(getAnnotationColor([
      { type: "TextualBody", purpose: "coloring", value: "red" },
    ])).toBe(DEFAULT_ANNOTATION_COLOR);
    expect(normalizeAnnotationColor(undefined)).toBe(DEFAULT_ANNOTATION_COLOR);
  });

  it("rewrites editable fields while preserving unrelated bodies", () => {
    const result = buildAnnotationBody(
      [
        { type: "TextualBody", purpose: "commenting", value: "Old" },
        { type: "TextualBody", purpose: "classifying", value: "malignant" },
        { type: "TextualBody", purpose: "coloring", value: "#000000" },
      ],
      {
        label: "  New label  ",
        notes: "  New notes  ",
        color: "#ABCDEF",
      },
    );

    expect(result).toEqual([
      {
        type: "TextualBody",
        purpose: "classifying",
        value: "malignant",
      },
      { type: "TextualBody", purpose: "tagging", value: "New label" },
      { type: "TextualBody", purpose: "commenting", value: "New notes" },
      { type: "TextualBody", purpose: "wsi-color", value: "#abcdef" },
    ]);
  });

  it("omits empty notes but keeps an explicit empty label", () => {
    expect(
      buildAnnotationBody([], {
        label: " ",
        notes: " ",
        color: "invalid",
      }),
    ).toEqual([
      { type: "TextualBody", purpose: "tagging", value: "" },
      {
        type: "TextualBody",
        purpose: "wsi-color",
        value: DEFAULT_ANNOTATION_COLOR,
      },
    ]);
  });

  it("updates the active fields without dropping earlier W3C bodies", () => {
    const result = buildAnnotationBody(
      [
        { type: "TextualBody", purpose: "tagging", value: "Imported tag" },
        { type: "TextualBody", purpose: "tagging", value: "Old label" },
        { type: "TextualBody", purpose: "commenting", value: "Imported note" },
        { type: "TextualBody", purpose: "commenting", value: "Old notes" },
        { type: "TextualBody", purpose: "coloring", value: "#000000" },
      ],
      {
        label: "New label",
        notes: "New notes",
        color: "#123456",
      },
    );

    expect(result).toEqual([
      { type: "TextualBody", purpose: "tagging", value: "Imported tag" },
      { type: "TextualBody", purpose: "commenting", value: "Imported note" },
      { type: "TextualBody", purpose: "tagging", value: "New label" },
      { type: "TextualBody", purpose: "commenting", value: "New notes" },
      { type: "TextualBody", purpose: "wsi-color", value: "#123456" },
    ]);
    expect(getAnnotationFields(result)).toEqual({
      label: "New label",
      notes: "New notes",
      color: "#123456",
    });
  });
});
