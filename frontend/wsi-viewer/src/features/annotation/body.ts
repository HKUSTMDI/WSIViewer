import type { AnnotationBody } from "@/types/annotation";

export const DEFAULT_ANNOTATION_COLOR = "#3b82f6";

const LABEL_PURPOSES = new Set(["tagging", "labeling"]);
const NOTES_PURPOSES = new Set(["commenting", "describing"]);
const COLOR_PURPOSES = new Set(["wsi-color", "coloring"]);

export interface AnnotationFields {
  label: string;
  notes: string;
  color: string;
}

function asBodies(body: unknown): AnnotationBody[] {
  const candidates = Array.isArray(body) ? body : body ? [body] : [];
  return candidates.filter(
    (candidate): candidate is AnnotationBody =>
      Boolean(
        candidate &&
          typeof candidate === "object" &&
          typeof (candidate as { value?: unknown }).value === "string" &&
          typeof (candidate as { purpose?: unknown }).purpose === "string",
      ),
  );
}

function findLastBody(
  bodies: AnnotationBody[],
  purposes: Set<string>,
): AnnotationBody | undefined {
  for (let index = bodies.length - 1; index >= 0; index -= 1) {
    if (purposes.has(bodies[index].purpose)) return bodies[index];
  }
  return undefined;
}

function findLastBodyIndex(
  bodies: AnnotationBody[],
  purposes: Set<string>,
): number {
  for (let index = bodies.length - 1; index >= 0; index -= 1) {
    if (purposes.has(bodies[index].purpose)) return index;
  }
  return -1;
}

export function normalizeAnnotationColor(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_ANNOTATION_COLOR;
}

export function getAnnotationFields(body: unknown): AnnotationFields {
  const bodies = asBodies(body);
  const labelBody = findLastBody(bodies, LABEL_PURPOSES);
  const notesBody = findLastBody(bodies, NOTES_PURPOSES);
  const colorBody = findLastBody(bodies, COLOR_PURPOSES);

  // Older annotations used a single `commenting` body as their label.
  const legacyLabel = labelBody ? "" : notesBody?.value ?? "";

  return {
    label: labelBody?.value ?? legacyLabel,
    notes: labelBody ? notesBody?.value ?? "" : "",
    color: normalizeAnnotationColor(colorBody?.value),
  };
}

export function getAnnotationLabel(body: unknown): string {
  return getAnnotationFields(body).label.trim() || "Untitled";
}

export function getAnnotationColor(body: unknown): string {
  return getAnnotationFields(body).color;
}

export function buildAnnotationBody(
  currentBody: unknown,
  fields: AnnotationFields,
): AnnotationBody[] {
  const bodies = asBodies(currentBody);
  const labelIndex = findLastBodyIndex(bodies, LABEL_PURPOSES);
  const noteIndex = findLastBodyIndex(bodies, NOTES_PURPOSES);
  const colorIndex = findLastBodyIndex(bodies, COLOR_PURPOSES);
  const managedIndexes = new Set([
    labelIndex >= 0 ? labelIndex : noteIndex,
    labelIndex >= 0 ? noteIndex : -1,
    colorIndex,
  ]);
  const preserved = bodies.filter(
    (_item, index) => !managedIndexes.has(index),
  );
  const label = fields.label.trim();
  const notes = fields.notes.trim();

  return [
    ...preserved,
    {
      type: "TextualBody",
      purpose: "tagging",
      value: label,
    },
    ...(notes
      ? [{
          type: "TextualBody",
          purpose: "commenting",
          value: notes,
        }]
      : []),
    {
      type: "TextualBody",
      purpose: "wsi-color",
      value: normalizeAnnotationColor(fields.color),
    },
  ];
}
