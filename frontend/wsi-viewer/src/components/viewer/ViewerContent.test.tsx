import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ViewerContent from "./ViewerContent";
import { ApiError, api } from "@/lib/api";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import type { Annotation, AnnotationBody } from "@/types/annotation";

interface SidebarCallbacks {
  onDeleteAnnotation: (id: string) => Promise<void>;
  onUpdateAnnotation: (
    id: string,
    body: AnnotationBody[],
  ) => Promise<void>;
  onExportGeoJson: () => void;
}

const harness = vi.hoisted(() => ({
  sidebar: null as unknown,
  download: vi.fn(),
}));

vi.mock("./WSIViewer", () => ({ default: () => null }));
vi.mock("./ScaleBar", () => ({ default: () => null }));
vi.mock("@/components/measurement/MeasureOverlay", () => ({
  default: () => null,
}));
vi.mock("@/components/annotation/FreehandOverlay", () => ({
  default: () => null,
}));
vi.mock("@/components/annotation/EraserOverlay", () => ({
  default: () => null,
}));
vi.mock("@/components/layout/ViewerSidebar", () => ({
  default: (props: SidebarCallbacks) => {
    harness.sidebar = props;
    return null;
  },
}));
vi.mock("@/features/annotation/geojson", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/annotation/geojson")>();
  return {
    ...original,
    downloadAnnotationsAsGeoJson: harness.download,
  };
});

function annotation(revision: number, label: string): Annotation {
  return {
    id: "annotation-1",
    type: "Annotation",
    body: {
      type: "TextualBody",
      purpose: "commenting",
      value: label,
    },
    target: {
      selector: {
        type: "RECTANGLE",
        geometry: { x: 0, y: 0, w: 10, h: 10 },
      },
    },
    created: "2026-07-29T00:00:00Z",
    modified: "2026-07-29T00:00:00Z",
    revision,
  };
}

function actions() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    removeVisual: vi.fn(),
    select: vi.fn(),
    cancelPendingCreate: vi.fn(() => false),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  harness.sidebar = null;
  harness.download.mockReset();
  useAnnotationStore.setState({
    annotations: [annotation(1, "Old")],
    selectedId: "annotation-1",
  });
  useViewerStore.setState({
    file: "slide.svs",
    activeTool: "pan",
    annoActions: actions(),
    error: null,
  });
});

describe("ViewerContent annotation metadata actions", () => {
  it("persists metadata with the current revision and refreshes the visual", async () => {
    const saved = annotation(2, "New");
    const update = vi.spyOn(api, "updateAnnotation").mockResolvedValue(saved);
    render(<ViewerContent file="slide.svs" />);
    const body = [{
      type: "TextualBody",
      purpose: "tagging",
      value: "New",
    }];

    await act(async () => {
      await (harness.sidebar as SidebarCallbacks).onUpdateAnnotation(
        saved.id,
        body,
      );
    });

    expect(update).toHaveBeenCalledWith("slide.svs", saved.id, {
      body,
      revision: 1,
    });
    expect(useAnnotationStore.getState().annotations).toEqual([saved]);
    expect(useViewerStore.getState().annoActions?.update).toHaveBeenCalledWith(
      saved,
    );
  });

  it("loads the latest revision after a 409 while rejecting the save", async () => {
    const latest = annotation(3, "Server");
    vi.spyOn(api, "updateAnnotation").mockRejectedValue(
      new ApiError(409, "Revision conflict"),
    );
    vi.spyOn(api, "getAnnotation").mockResolvedValue(latest);
    render(<ViewerContent file="slide.svs" />);

    await expect(
      (harness.sidebar as SidebarCallbacks).onUpdateAnnotation(
        latest.id,
        [{
          type: "TextualBody",
          purpose: "tagging",
          value: "My draft",
        }],
      ),
    ).rejects.toThrow("latest version was loaded");

    expect(useAnnotationStore.getState().annotations).toEqual([latest]);
    expect(useViewerStore.getState().annoActions?.update).toHaveBeenCalledWith(
      latest,
    );
    expect(useViewerStore.getState().error).toContain(
      "review your edits and save again",
    );
  });

  it("reports a failed conflict refresh instead of swallowing it", async () => {
    vi.spyOn(api, "updateAnnotation").mockRejectedValue(
      new ApiError(409, "Revision conflict"),
    );
    vi.spyOn(api, "getAnnotation").mockRejectedValue(
      new ApiError(503, "Temporarily unavailable"),
    );
    render(<ViewerContent file="slide.svs" />);

    await expect(
      (harness.sidebar as SidebarCallbacks).onUpdateAnnotation(
        "annotation-1",
        [{
          type: "TextualBody",
          purpose: "tagging",
          value: "My draft",
        }],
      ),
    ).rejects.toThrow("latest version could not be loaded");
    expect(useViewerStore.getState().error).toContain(
      "Temporarily unavailable",
    );
  });

  it("removes local and visual state after a 404", async () => {
    vi.spyOn(api, "updateAnnotation").mockRejectedValue(
      new ApiError(404, "Not found"),
    );
    render(<ViewerContent file="slide.svs" />);

    await expect(
      (harness.sidebar as SidebarCallbacks).onUpdateAnnotation(
        "annotation-1",
        [],
      ),
    ).rejects.toThrow("deleted elsewhere");

    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [],
      selectedId: null,
    });
    expect(
      useViewerStore.getState().annoActions?.removeVisual,
    ).toHaveBeenCalledWith("annotation-1");
  });

  it("refreshes a conflicting revision before a sidebar delete is retried", async () => {
    const latest = annotation(4, "Latest");
    vi.spyOn(api, "deleteAnnotation").mockRejectedValue(
      new ApiError(409, "Revision conflict"),
    );
    vi.spyOn(api, "getAnnotation").mockResolvedValue(latest);
    render(<ViewerContent file="slide.svs" />);

    await act(async () => {
      await (harness.sidebar as SidebarCallbacks).onDeleteAnnotation(
        "annotation-1",
      );
    });

    expect(useAnnotationStore.getState().annotations).toEqual([latest]);
    expect(useViewerStore.getState().annoActions?.update).toHaveBeenCalledWith(
      latest,
    );
    expect(useViewerStore.getState().error).toContain(
      "delete it again to confirm",
    );
  });

  it("deletes the selected annotation with Delete through the revision-safe flow", async () => {
    const deleteAnnotation = vi
      .spyOn(api, "deleteAnnotation")
      .mockResolvedValue(undefined);
    render(<ViewerContent file="slide.svs" />);

    fireEvent.keyDown(document.body, { key: "Delete" });

    await waitFor(() =>
      expect(deleteAnnotation).toHaveBeenCalledWith(
        "slide.svs",
        "annotation-1",
        { revision: 1 },
      ),
    );
    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [],
      selectedId: null,
    });
    expect(
      useViewerStore.getState().annoActions?.removeVisual,
    ).toHaveBeenCalledWith("annotation-1");
  });

  it("cancels a selected annotation whose create request is still pending", async () => {
    const annoActions = actions();
    annoActions.cancelPendingCreate.mockReturnValue(true);
    useAnnotationStore.setState({
      annotations: [],
      selectedId: "temporary-annotation",
    });
    useViewerStore.setState({ annoActions });
    const deleteAnnotation = vi.spyOn(api, "deleteAnnotation");
    render(<ViewerContent file="slide.svs" />);

    fireEvent.keyDown(document.body, { key: "Delete" });

    await waitFor(() =>
      expect(annoActions.cancelPendingCreate).toHaveBeenCalledWith(
        "temporary-annotation",
      ),
    );
    expect(deleteAnnotation).not.toHaveBeenCalled();
  });

  it("deduplicates rapid Delete presses while a conflict refresh is pending", async () => {
    const latest = annotation(4, "Latest");
    const refresh = deferred<Annotation>();
    const deleteAnnotation = vi
      .spyOn(api, "deleteAnnotation")
      .mockRejectedValue(new ApiError(409, "Revision conflict"));
    vi.spyOn(api, "getAnnotation").mockReturnValue(refresh.promise);
    render(<ViewerContent file="slide.svs" />);

    fireEvent.keyDown(document.body, { key: "Delete" });
    fireEvent.keyDown(document.body, { key: "Delete" });

    await waitFor(() => expect(deleteAnnotation).toHaveBeenCalledOnce());
    refresh.resolve(latest);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([latest]),
    );

    expect(useAnnotationStore.getState().selectedId).toBe(latest.id);
    expect(useViewerStore.getState().error).toContain(
      "delete it again to confirm",
    );
  });

  it("exports the latest store snapshot and surfaces conversion errors", async () => {
    render(<ViewerContent file="病例.svs" />);
    (harness.sidebar as SidebarCallbacks).onExportGeoJson();
    expect(harness.download).toHaveBeenCalledWith(
      useAnnotationStore.getState().annotations,
      "病例.svs",
    );

    harness.download.mockImplementationOnce(() => {
      throw new Error("Unsupported annotation");
    });
    act(() => {
      (harness.sidebar as SidebarCallbacks).onExportGeoJson();
    });
    await waitFor(() =>
      expect(useViewerStore.getState().error).toBe("Unsupported annotation"),
    );
  });

  it("clears cross-slide state before exporting a newly selected slide", () => {
    render(<ViewerContent file="next.svs" />);

    expect(useViewerStore.getState().file).toBe("next.svs");
    expect(useAnnotationStore.getState()).toMatchObject({
      annotations: [],
      selectedId: null,
    });

    (harness.sidebar as SidebarCallbacks).onExportGeoJson();
    expect(harness.download).toHaveBeenCalledWith([], "next.svs");
  });
});
