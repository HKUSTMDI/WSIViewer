import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnnotationList from "./AnnotationList";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import type { Annotation } from "@/types/annotation";

const annotation: Annotation = {
  id: "annotation-1",
  type: "Annotation",
  body: [],
  target: { selector: {} },
  created: "2026-07-28T00:00:00Z",
  modified: "2026-07-28T00:00:00Z",
  revision: 1,
};

beforeEach(() => {
  useAnnotationStore.setState({
    annotations: [annotation],
    selectedId: null,
  });
  useViewerStore.setState({ annoActions: null });
});

describe("AnnotationList selection", () => {
  it("delegates selection to Annotorious without writing selectedId directly", () => {
    const select = vi.fn();
    useViewerStore.setState({
      annoActions: {
        add: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
        removeVisual: vi.fn(),
        select,
      },
    });
    const { getByText } = render(<AnnotationList />);

    fireEvent.click(getByText("Untitled"));

    expect(select).toHaveBeenCalledWith("annotation-1");
    expect(useAnnotationStore.getState().selectedId).toBeNull();
  });

  it("does not create a phantom selection before Annotorious is ready", () => {
    const { getByText } = render(<AnnotationList />);

    fireEvent.click(getByText("Untitled"));

    expect(useAnnotationStore.getState().selectedId).toBeNull();
  });

  it("clears the selected ID when the final annotation is deleted", () => {
    useAnnotationStore.setState({ selectedId: "annotation-1" });
    const onDelete = (id: string) =>
      useAnnotationStore.getState().removeAnnotation(id);
    const { getByRole } = render(<AnnotationList onDelete={onDelete} />);

    fireEvent.click(
      getByRole("button", { name: "Delete annotation 1" }),
    );

    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [],
      selectedId: null,
    });
  });
});
