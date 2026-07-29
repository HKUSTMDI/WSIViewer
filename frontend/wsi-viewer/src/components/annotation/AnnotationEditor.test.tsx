import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AnnotationEditor from "./AnnotationEditor";
import type { Annotation } from "@/types/annotation";

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "annotation-1",
    type: "Annotation",
    body: {
      type: "TextualBody",
      purpose: "commenting",
      value: "Legacy label",
    },
    target: {
      selector: {
        type: "RECTANGLE",
        geometry: { x: 0, y: 0, w: 10, h: 10 },
      },
    },
    created: "2026-07-29T00:00:00Z",
    modified: "2026-07-29T00:00:00Z",
    revision: 1,
    ...overrides,
  };
}

describe("AnnotationEditor", () => {
  it("edits and saves label, notes and color", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByRole } = render(
      <AnnotationEditor annotation={annotation()} onSave={onSave} />,
    );
    const label = getByLabelText("Label");

    expect(label).toHaveValue("Legacy label");
    expect(getByLabelText("Notes")).toHaveValue("");
    expect(getByLabelText("Annotation color")).toHaveValue("#3b82f6");

    await user.clear(label);
    await user.type(label, "Tumor region");
    await user.type(getByLabelText("Notes"), "High grade");
    fireEvent.change(getByLabelText("Annotation color"), {
      target: { value: "#ff00aa" },
    });
    await user.click(getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith("annotation-1", [
      {
        type: "TextualBody",
        purpose: "tagging",
        value: "Tumor region",
      },
      {
        type: "TextualBody",
        purpose: "commenting",
        value: "High grade",
      },
      {
        type: "TextualBody",
        purpose: "wsi-color",
        value: "#ff00aa",
      },
    ]);
  });

  it("requires a non-empty label", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, getByRole } = render(
      <AnnotationEditor annotation={annotation()} onSave={onSave} />,
    );

    await user.clear(getByLabelText("Label"));

    expect(getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("prevents duplicate saves while a request is pending", async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { getByLabelText, getByRole } = render(
      <AnnotationEditor annotation={annotation()} onSave={onSave} />,
    );
    await user.type(getByLabelText("Label"), " updated");
    const save = getByRole("button", { name: "Save changes" });

    await user.click(save);
    expect(getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.click(getByRole("button", { name: "Saving…" }));
    expect(onSave).toHaveBeenCalledOnce();

    resolveSave?.();
    await waitFor(() =>
      expect(getByRole("button", { name: "Save changes" })).toBeEnabled(),
    );
  });

  it("keeps the draft visible when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("Revision conflict"));
    const { getByLabelText, getByRole } = render(
      <AnnotationEditor annotation={annotation()} onSave={onSave} />,
    );
    const label = getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Unsaved draft");

    await user.click(getByRole("button", { name: "Save changes" }));

    expect(await getByRole("alert")).toHaveTextContent("Revision conflict");
    expect(label).toHaveValue("Unsaved draft");
  });

  it("keeps an unsaved draft when a newer revision is loaded", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, rerender } = render(
      <AnnotationEditor annotation={annotation()} onSave={onSave} />,
    );
    const label = getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "My draft");

    rerender(
      <AnnotationEditor
        annotation={annotation({
          revision: 2,
          body: {
            type: "TextualBody",
            purpose: "commenting",
            value: "Server version",
          },
        })}
        onSave={onSave}
      />,
    );

    expect(label).toHaveValue("My draft");
  });

  it("resets a draft to the latest persisted fields", async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole } = render(
      <AnnotationEditor
        annotation={annotation()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const label = getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Changed");

    await user.click(getByRole("button", { name: "Reset" }));

    expect(label).toHaveValue("Legacy label");
    expect(getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});
