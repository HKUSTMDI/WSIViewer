"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildAnnotationBody,
  getAnnotationFields,
  normalizeAnnotationColor,
  type AnnotationFields,
} from "@/features/annotation/body";
import type { Annotation, AnnotationBody } from "@/types/annotation";

interface AnnotationEditorProps {
  annotation: Annotation;
  onSave: (id: string, body: AnnotationBody[]) => Promise<void>;
}

export default function AnnotationEditor({
  annotation,
  onSave,
}: AnnotationEditorProps) {
  const persisted = useMemo(
    () => getAnnotationFields(annotation.body),
    [annotation.body],
  );
  const [fields, setFields] = useState<AnnotationFields>(persisted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const normalizedFields = {
    label: fields.label.trim(),
    notes: fields.notes.trim(),
    color: normalizeAnnotationColor(fields.color),
  };
  const isDirty =
    normalizedFields.label !== persisted.label.trim() ||
    normalizedFields.notes !== persisted.notes.trim() ||
    normalizedFields.color !== normalizeAnnotationColor(persisted.color);
  const canSave = Boolean(normalizedFields.label) && isDirty && !saving;

  const reset = () => {
    setFields(persisted);
    setSaveError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(
        annotation.id,
        buildAnnotationBody(annotation.body, normalizedFields),
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save annotation",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      aria-label="Edit annotation"
      className="space-y-3 p-3"
      onSubmit={submit}
    >
      <div>
        <h4 className="text-sm font-semibold">Annotation details</h4>
        <p className="text-xs text-muted-foreground">
          Changes are saved to this slide.
        </p>
      </div>

      <fieldset className="space-y-3" disabled={saving}>
        <div className="space-y-1">
          <label
            className="text-xs font-medium"
            htmlFor={`annotation-label-${annotation.id}`}
          >
            Label
          </label>
          <Input
            id={`annotation-label-${annotation.id}`}
            value={fields.label}
            placeholder="e.g. Tumor region"
            required
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1">
          <label
            className="text-xs font-medium"
            htmlFor={`annotation-notes-${annotation.id}`}
          >
            Notes
          </label>
          <textarea
            id={`annotation-notes-${annotation.id}`}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
            value={fields.notes}
            placeholder="Optional notes"
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1">
          <label
            className="text-xs font-medium"
            htmlFor={`annotation-color-${annotation.id}`}
          >
            Color
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`annotation-color-${annotation.id}`}
              aria-label="Annotation color"
              className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
              type="color"
              value={normalizeAnnotationColor(fields.color)}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
            />
            <span className="font-mono text-xs text-muted-foreground">
              {normalizeAnnotationColor(fields.color)}
            </span>
          </div>
        </div>
      </fieldset>

      {saveError && (
        <p role="alert" className="text-xs text-destructive">
          {saveError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty || saving}
          onClick={reset}
        >
          Reset
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
