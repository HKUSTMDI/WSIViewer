import { beforeEach, describe, expect, it } from "vitest";
import { useAnnotationStore } from "./annotationStore";
import type { Annotation } from "@/types/annotation";

function annotation(id: string): Annotation {
  return {
    id,
    type: "Annotation",
    body: [],
    target: { selector: {} },
    created: "2026-07-28T00:00:00Z",
    modified: "2026-07-28T00:00:00Z",
    revision: 1,
  };
}

beforeEach(() => {
  useAnnotationStore.setState({ annotations: [], selectedId: null });
});

describe("annotationStore selection consistency", () => {
  it("keeps a selection that exists in a refreshed annotation list", () => {
    useAnnotationStore.setState({
      annotations: [annotation("a")],
      selectedId: "a",
    });

    useAnnotationStore.getState().setAnnotations([
      annotation("a"),
      annotation("b"),
    ]);

    expect(useAnnotationStore.getState().selectedId).toBe("a");
  });

  it("clears a stale selection when annotations are replaced", () => {
    useAnnotationStore.setState({
      annotations: [annotation("old")],
      selectedId: "old",
    });

    useAnnotationStore.getState().setAnnotations([annotation("new")]);

    expect(useAnnotationStore.getState().selectedId).toBeNull();
  });

  it("clears the selection when the selected annotation is removed", () => {
    useAnnotationStore.setState({
      annotations: [annotation("a"), annotation("b")],
      selectedId: "a",
    });

    useAnnotationStore.getState().removeAnnotation("a");

    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [expect.objectContaining({ id: "b" })],
      selectedId: null,
    });
  });

  it("keeps the selection when a different annotation is removed", () => {
    useAnnotationStore.setState({
      annotations: [annotation("a"), annotation("b")],
      selectedId: "a",
    });

    useAnnotationStore.getState().removeAnnotation("b");

    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [expect.objectContaining({ id: "a" })],
      selectedId: "a",
    });
  });
});
