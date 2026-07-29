import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type OpenSeadragon from "openseadragon";
import FreehandOverlay from "./FreehandOverlay";
import EraserOverlay from "./EraserOverlay";
import { ApiError, api } from "@/lib/api";
import { enqueueAnnotationMutation } from "@/features/annotation/mutationQueue";
import { useViewerStore } from "@/stores/viewerStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import type { Annotation } from "@/types/annotation";

const baseAnnotation: Annotation = {
  id: "annotation-1",
  type: "Annotation",
  body: [],
  target: {
    selector: {
      type: "POLYGON",
      geometry: {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        points: [[0, 0], [100, 0], [100, 100], [0, 100]],
      },
    },
  },
  created: "2026-07-16T00:00:00Z",
  modified: "2026-07-16T00:00:00Z",
  revision: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createAnnoActions() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    removeVisual: vi.fn(),
    select: vi.fn(),
  };
}

function createViewer(element: HTMLElement): OpenSeadragon.Viewer {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });
  return {
    element,
    viewport: {
      pointFromPixel: (point: OpenSeadragon.Point) => point,
      getBounds: () => ({ width: 1 }),
      getContainerSize: () => ({ x: 100 }),
    },
    world: {
      getItemAt: () => ({
        viewportToImageCoordinates: (point: OpenSeadragon.Point) => point,
        getContentSize: () => ({ x: 100 }),
      }),
    },
  } as unknown as OpenSeadragon.Viewer;
}

function dispatchPointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
  pointerId = 1,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

beforeEach(() => {
  useViewerStore.setState({
    activeTool: "pan",
    error: null,
    annoActions: null,
    eraserSize: 40,
  });
  useAnnotationStore.setState({ annotations: [], selectedId: null });
});

afterEach(() => vi.restoreAllMocks());

describe("FreehandOverlay", () => {
  it("persists exactly one annotation for a completed primary-pointer stroke", async () => {
    vi.spyOn(api, "createAnnotation").mockResolvedValue(baseAnnotation);
    useViewerStore.setState({ activeTool: "freehand" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><FreehandOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Freehand annotation canvas");

    dispatchPointer(canvas, "pointerdown", 0, 0);
    dispatchPointer(canvas, "pointermove", 20, 0);
    dispatchPointer(canvas, "pointermove", 20, 20);
    dispatchPointer(canvas, "pointermove", 0, 20);
    dispatchPointer(canvas, "pointerup", 0, 20);

    await waitFor(() => expect(api.createAnnotation).toHaveBeenCalledTimes(1));
    expect(useAnnotationStore.getState().annotations).toEqual([baseAnnotation]);
  });

  it("does not save a cancelled stroke", async () => {
    const create = vi.spyOn(api, "createAnnotation").mockResolvedValue(baseAnnotation);
    useViewerStore.setState({ activeTool: "freehand" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><FreehandOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Freehand annotation canvas");
    dispatchPointer(canvas, "pointerdown", 0, 0);
    dispatchPointer(canvas, "pointermove", 20, 0);
    dispatchPointer(canvas, "pointermove", 20, 20);
    dispatchPointer(canvas, "pointercancel", 20, 20);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(create).not.toHaveBeenCalled();
  });

  it("surfaces save failures without adding a local annotation", async () => {
    vi.spyOn(api, "createAnnotation").mockRejectedValue(new Error("save failed"));
    useViewerStore.setState({ activeTool: "freehand" });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><FreehandOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Freehand annotation canvas");
    dispatchPointer(canvas, "pointerdown", 0, 0);
    dispatchPointer(canvas, "pointermove", 20, 0);
    dispatchPointer(canvas, "pointermove", 20, 20);
    dispatchPointer(canvas, "pointermove", 0, 20);
    dispatchPointer(canvas, "pointerup", 0, 20);

    await waitFor(() => expect(useViewerStore.getState().error).toBe("save failed"));
    expect(useAnnotationStore.getState().annotations).toEqual([]);
  });
});

describe("EraserOverlay", () => {
  it("persists a partial erase as native multipolygon geometry", async () => {
    const updated = {
      ...baseAnnotation,
      modified: "2026-07-16T00:01:00Z",
    };
    const batch = vi.spyOn(api, "applyAnnotationBatch").mockResolvedValue({
      created: [],
      updated: [updated],
      deleted: [],
    });
    const actions = createAnnoActions();
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");
    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
    expect(batch.mock.calls[0][1][0].target?.selector).toMatchObject({
      type: "MULTIPOLYGON",
    });
  });

  it("uses the latest revision when metadata saves during an eraser stroke", async () => {
    const batch = vi.spyOn(api, "applyAnnotationBatch").mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
    });
    const actions = createAnnoActions();
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    useAnnotationStore.setState({
      annotations: [{ ...baseAnnotation, revision: 2 }],
    });
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
    expect(batch.mock.calls[0][1][0].revision).toBe(2);
  });

  it("cancels an erase instead of overwriting geometry changed mid-stroke", async () => {
    const batch = vi.spyOn(api, "applyAnnotationBatch");
    const actions = createAnnoActions();
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");
    const changed = {
      ...baseAnnotation,
      revision: 2,
      target: {
        selector: {
          type: "RECTANGLE",
          geometry: { x: 10, y: 10, w: 20, h: 20 },
        },
      },
    };

    dispatchPointer(canvas, "pointerdown", 50, 50);
    useAnnotationStore.setState({ annotations: [changed] });
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() =>
      expect(useViewerStore.getState().error).toContain(
        "geometry changed while erasing",
      ),
    );
    expect(batch).not.toHaveBeenCalled();
    expect(actions.update).toHaveBeenLastCalledWith(changed);
  });

  it("restores the preview and never calls the API after pointer cancellation", async () => {
    const batchApi = vi.spyOn(api, "applyAnnotationBatch").mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
    });
    const actions = createAnnoActions();
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");
    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointermove", 51, 50);
    dispatchPointer(canvas, "pointercancel", 51, 50);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(batchApi).not.toHaveBeenCalled();
    expect(actions.update).toHaveBeenCalledWith(baseAnnotation);
  });

  it("refreshes a batch conflict and uses the latest revision on the next erase", async () => {
    const latest = {
      ...baseAnnotation,
      modified: "2026-07-16T00:02:00Z",
      revision: 7,
    };
    const saved = {
      ...latest,
      modified: "2026-07-16T00:03:00Z",
      revision: 8,
    };
    const batch = vi
      .spyOn(api, "applyAnnotationBatch")
      .mockRejectedValueOnce(
        new ApiError(409, "Revision conflict", {
          annotation_id: baseAnnotation.id,
          actual_revision: latest.revision,
        }),
      )
      .mockResolvedValueOnce({
        created: [],
        updated: [saved],
        deleted: [],
      });
    const getAnnotation = vi
      .spyOn(api, "getAnnotation")
      .mockResolvedValue(latest);
    const actions = createAnnoActions();
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() => expect(getAnnotation).toHaveBeenCalledWith(
      "slide.svs",
      baseAnnotation.id,
    ));
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([latest]),
    );
    expect(actions.update).toHaveBeenLastCalledWith(latest);

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() => expect(batch).toHaveBeenCalledTimes(2));
    expect(batch.mock.calls[1][1][0].revision).toBe(latest.revision);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([saved]),
    );
  });

  it("removes an annotation when conflict refresh reports it was deleted", async () => {
    vi.spyOn(api, "applyAnnotationBatch").mockRejectedValue(
      new ApiError(409, "Revision conflict", {
        annotation_id: baseAnnotation.id,
        actual_revision: 2,
      }),
    );
    vi.spyOn(api, "getAnnotation").mockRejectedValue(
      new ApiError(404, "Not found"),
    );
    const actions = createAnnoActions();
    useAnnotationStore.setState({
      annotations: [baseAnnotation],
      selectedId: baseAnnotation.id,
    });
    useViewerStore.setState({ activeTool: "eraser", annoActions: actions });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);

    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([]),
    );
    expect(useAnnotationStore.getState().selectedId).toBeNull();
    expect(actions.removeVisual).toHaveBeenCalledWith(baseAnnotation.id);
    expect(useViewerStore.getState().error).toContain(
      "already deleted elsewhere",
    );
  });

  it("does not enter a queued erase operation after switching slides", async () => {
    const blocker = deferred<void>();
    const blockingMutation = enqueueAnnotationMutation(
      "slide.svs",
      baseAnnotation.id,
      () => blocker.promise,
    );
    const batch = vi.spyOn(api, "applyAnnotationBatch");
    const oldActions = createAnnoActions();
    const newActions = createAnnoActions();
    const nextSlideAnnotation = {
      ...baseAnnotation,
      id: "next-slide-annotation",
    };
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({
      activeTool: "eraser",
      annoActions: oldActions,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText, rerender } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);
    await Promise.resolve();
    expect(batch).not.toHaveBeenCalled();

    rerender(
      <div><EraserOverlay viewer={viewer} file="next.svs" /></div>,
    );
    useAnnotationStore.setState({ annotations: [nextSlideAnnotation] });
    useViewerStore.setState({ annoActions: newActions, error: null });
    oldActions.update.mockClear();
    blocker.resolve();
    await blockingMutation;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(batch).not.toHaveBeenCalled();
    expect(useAnnotationStore.getState().annotations).toEqual([
      nextSlideAnnotation,
    ]);
    expect(useViewerStore.getState().error).toBeNull();
    expect(oldActions.update).not.toHaveBeenCalled();
    expect(newActions.update).not.toHaveBeenCalled();
  });

  it("ignores an old request failure across an A-to-B-to-A switch", async () => {
    const request = deferred<never>();
    const batch = vi
      .spyOn(api, "applyAnnotationBatch")
      .mockReturnValue(request.promise);
    const oldActions = createAnnoActions();
    const newActions = createAnnoActions();
    const returnedSlideAnnotation = {
      ...baseAnnotation,
      id: "returned-slide-annotation",
    };
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({
      activeTool: "eraser",
      annoActions: oldActions,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText, rerender } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));

    rerender(
      <div><EraserOverlay viewer={viewer} file="next.svs" /></div>,
    );
    rerender(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    useAnnotationStore.setState({ annotations: [returnedSlideAnnotation] });
    useViewerStore.setState({ annoActions: newActions, error: null });
    oldActions.update.mockClear();
    request.reject(new Error("old slide failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useAnnotationStore.getState().annotations).toEqual([
      returnedSlideAnnotation,
    ]);
    expect(useViewerStore.getState().error).toBeNull();
    expect(oldActions.update).not.toHaveBeenCalled();
    expect(newActions.update).not.toHaveBeenCalled();
  });

  it("keeps a new-slide stroke intact when the old request settles", async () => {
    const oldRequest = deferred<{
      created: Annotation[];
      updated: Annotation[];
      deleted: string[];
    }>();
    const newRequest = deferred<{
      created: Annotation[];
      updated: Annotation[];
      deleted: string[];
    }>();
    const batch = vi
      .spyOn(api, "applyAnnotationBatch")
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const oldActions = createAnnoActions();
    const newActions = createAnnoActions();
    const nextSlideAnnotation = {
      ...baseAnnotation,
      id: "next-slide-annotation",
    };
    const oldSlideSaved = {
      ...baseAnnotation,
      revision: 2,
    };
    const nextSlideSaved = {
      ...nextSlideAnnotation,
      revision: 2,
    };
    useAnnotationStore.setState({ annotations: [baseAnnotation] });
    useViewerStore.setState({
      activeTool: "eraser",
      annoActions: oldActions,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const viewer = createViewer(host);
    const { getByLabelText, rerender } = render(
      <div><EraserOverlay viewer={viewer} file="slide.svs" /></div>,
    );
    const canvas = getByLabelText("Annotation eraser canvas");

    dispatchPointer(canvas, "pointerdown", 50, 50);
    dispatchPointer(canvas, "pointerup", 50, 50);
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));

    rerender(
      <div><EraserOverlay viewer={viewer} file="next.svs" /></div>,
    );
    useAnnotationStore.setState({ annotations: [nextSlideAnnotation] });
    useViewerStore.setState({ annoActions: newActions, error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    oldActions.update.mockClear();
    dispatchPointer(canvas, "pointerdown", 50, 50);

    oldRequest.resolve({
      created: [],
      updated: [oldSlideSaved],
      deleted: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    dispatchPointer(canvas, "pointerup", 50, 50);
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(2));

    expect(useAnnotationStore.getState().annotations).toEqual([
      nextSlideAnnotation,
    ]);
    expect(useViewerStore.getState().error).toBeNull();
    expect(oldActions.update).not.toHaveBeenCalled();

    newRequest.resolve({
      created: [],
      updated: [nextSlideSaved],
      deleted: [],
    });
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([
        nextSlideSaved,
      ]),
    );
    expect(newActions.update).toHaveBeenLastCalledWith(nextSlideSaved);
  });
});
