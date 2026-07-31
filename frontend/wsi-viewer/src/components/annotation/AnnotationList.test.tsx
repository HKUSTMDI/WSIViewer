import { fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
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
        cancelPendingCreate: vi.fn(),
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

  it("supports keyboard selection and exposes the focused delete action", async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    const onDelete = vi.fn();
    useViewerStore.setState({
      annoActions: {
        add: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
        removeVisual: vi.fn(),
        select,
        cancelPendingCreate: vi.fn(),
      },
    });
    const { getByRole } = render(<AnnotationList onDelete={onDelete} />);
    const selection = getByRole("button", {
      name: "Select annotation 1: Untitled",
    });
    const deletion = getByRole("button", { name: "Delete annotation 1" });

    await user.tab();
    expect(selection).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(select).toHaveBeenCalledWith("annotation-1");

    await user.tab();
    expect(deletion).toHaveFocus();
    expect(deletion).toHaveClass("focus-visible:opacity-100");
    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledWith("annotation-1");
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
