import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/types/annotation";
import { ApiError, api } from "@/lib/api";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import AnnotationHandler, {
  parseApiAnnotationForAnnotorious,
} from "./AnnotationHandler";

type Listener = (...args: unknown[]) => void;

const annotoriousMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("@annotorious/react", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@annotorious/react")>();
  return {
    ...original,
    useAnnotator: () => annotoriousMock.current,
  };
});

vi.mock("@annotorious/plugin-tools", () => ({
  mountPlugin: vi.fn(),
}));

function annotation(revision: number, x: number): Annotation {
  return {
    id: "annotation-1",
    type: "Annotation",
    body: [],
    target: {
      selector: {
        type: "RECTANGLE",
        geometry: { x, y: 0, w: 10, h: 10 },
      },
    },
    created: "2026-07-29T00:00:00Z",
    modified: `2026-07-29T00:0${revision}:00Z`,
    revision,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createAnnotator() {
  const listeners = new Map<string, Listener>();
  const stored = new Map<string, Record<string, unknown>>();
  let externalAnnotations: Annotation[] = [];
  const store = {
    addAnnotation: vi.fn((item: Record<string, unknown>) => {
      stored.set(item.id as string, item);
    }),
    deleteAnnotation: vi.fn((id: string) => {
      stored.delete(id);
    }),
    getAnnotation: vi.fn((id: string) => stored.get(id)),
    updateAnnotation: vi.fn((item: Record<string, unknown>) => {
      stored.set(item.id as string, item);
    }),
  };
  const annotator = {
    addAnnotation: vi.fn((item: Annotation) => {
      externalAnnotations.push(item);
      stored.set(item.id, item as unknown as Record<string, unknown>);
    }),
    removeAnnotation: vi.fn(),
    getAnnotations: vi.fn(() => externalAnnotations),
    getSelected: vi.fn((): Array<{ id?: string }> => []),
    setAnnotations: vi.fn((items: Annotation[]) => {
      externalAnnotations = [...items];
      stored.clear();
      for (const item of items) {
        stored.set(item.id, item as unknown as Record<string, unknown>);
      }
    }),
    setSelected: vi.fn(),
    cancelSelected: vi.fn(),
    setVisible: vi.fn(),
    state: { store },
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
    }),
    off: vi.fn((event: string, listener: Listener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
  };
  return { annotator, listeners, store };
}

beforeEach(() => {
  vi.restoreAllMocks();
  useAnnotationStore.setState({ annotations: [], selectedId: null });
  useViewerStore.setState({
    annoActions: null,
    error: null,
    mpp: null,
  });
});

describe("parseApiAnnotationForAnnotorious", () => {
  it("normalizes legacy FragmentSelector rectangles", () => {
    const parsed = parseApiAnnotationForAnnotorious({
      ...annotation(1, 0),
      target: {
        selector: {
          type: "FragmentSelector",
          conformsTo: "http://www.w3.org/TR/media-frags/",
          value: "xywh=pixel:10,20,30,40",
        },
      },
    });

    expect(parsed).toMatchObject({
      id: "annotation-1",
      target: {
        annotation: "annotation-1",
        selector: {
          type: "RECTANGLE",
          geometry: {
            x: 10,
            y: 20,
            w: 30,
            h: 40,
            bounds: { minX: 10, minY: 20, maxX: 40, maxY: 60 },
          },
        },
      },
    });
  });

  it("normalizes legacy SVG polygon selectors", () => {
    const parsed = parseApiAnnotationForAnnotorious({
      ...annotation(1, 0),
      target: {
        selector: {
          type: "SvgSelector",
          value: '<svg><polygon points="0,0 12,0 4,9" /></svg>',
        },
      },
    });

    expect(parsed.target).toMatchObject({
      annotation: "annotation-1",
      selector: {
        type: "POLYGON",
        geometry: {
          points: [
            [0, 0],
            [12, 0],
            [4, 9],
          ],
          bounds: { minX: 0, minY: 0, maxX: 12, maxY: 9 },
        },
      },
    });
  });

  it("adds hit-test bounds to migrated internal polygons", () => {
    const parsed = parseApiAnnotationForAnnotorious({
      ...annotation(1, 0),
      target: {
        selector: {
          type: "POLYGON",
          geometry: {
            points: [
              [2, 4],
              [10, 3],
              [6, 11],
            ],
          },
        },
      },
    });

    expect(parsed.target).toMatchObject({
      annotation: "annotation-1",
      selector: {
        type: "POLYGON",
        geometry: {
          bounds: { minX: 2, minY: 3, maxX: 10, maxY: 11 },
        },
      },
    });
  });
});

describe("AnnotationHandler revision synchronization", () => {
  it("parses every supported legacy selector before the initial visual load", async () => {
    const loaded: Annotation[] = [
      {
        ...annotation(1, 0),
        id: "fragment",
        target: {
          selector: {
            type: "FragmentSelector",
            value: "xywh=pixel:1,2,3,4",
          },
        },
      },
      {
        ...annotation(1, 0),
        id: "svg",
        target: {
          selector: {
            type: "SvgSelector",
            value: '<svg><polygon points="0,0 8,0 0,6" /></svg>',
          },
        },
      },
      {
        ...annotation(1, 0),
        id: "internal-polygon",
        target: {
          selector: {
            type: "POLYGON",
            geometry: {
              points: [
                [3, 4],
                [9, 4],
                [4, 12],
              ],
            },
          },
        },
      },
    ];
    const { annotator } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue(loaded);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });

    render(<AnnotationHandler file="slide.svs" visible />);

    await waitFor(() =>
      expect(annotator.setAnnotations).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: "fragment",
            target: expect.objectContaining({
              annotation: "fragment",
              selector: expect.objectContaining({
                type: "RECTANGLE",
                geometry: expect.objectContaining({
                  bounds: { minX: 1, minY: 2, maxX: 4, maxY: 6 },
                }),
              }),
            }),
          }),
          expect.objectContaining({
            id: "svg",
            target: expect.objectContaining({
              annotation: "svg",
              selector: expect.objectContaining({
                type: "POLYGON",
                geometry: expect.objectContaining({
                  bounds: { minX: 0, minY: 0, maxX: 8, maxY: 6 },
                }),
              }),
            }),
          }),
          expect.objectContaining({
            id: "internal-polygon",
            target: expect.objectContaining({
              annotation: "internal-polygon",
              selector: expect.objectContaining({
                type: "POLYGON",
                geometry: expect.objectContaining({
                  bounds: { minX: 3, minY: 4, maxX: 9, maxY: 12 },
                }),
              }),
            }),
          }),
        ],
        true,
      ),
    );
    expect(useAnnotationStore.getState().annotations).toEqual(loaded);
  });

  it("keeps a newly created annotation when the initial GET resolves late", async () => {
    const temporary = {
      ...annotation(0, 0),
      id: "temporary-annotation",
    };
    const saved = annotation(1, 0);
    const initialLoad = deferred<Annotation[]>();
    const { annotator, listeners } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockReturnValue(initialLoad.promise);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "createAnnotation").mockResolvedValue(saved);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(annotator.on).toHaveBeenCalledWith(
        "createAnnotation",
        expect.any(Function),
      ),
    );

    act(() => {
      listeners.get("createAnnotation")?.(temporary);
    });
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([saved]),
    );

    initialLoad.resolve([]);
    await act(async () => {
      await initialLoad.promise;
      await Promise.resolve();
    });

    expect(useAnnotationStore.getState().annotations).toEqual([saved]);
    expect(annotator.setAnnotations).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          id: saved.id,
          target: expect.objectContaining({ annotation: saved.id }),
        }),
      ],
      true,
    );
  });

  it("preserves an in-flight temporary shape when the initial GET resolves first", async () => {
    const temporary = {
      ...annotation(0, 0),
      id: "temporary-annotation",
    };
    const saved = annotation(1, 0);
    const initialLoad = deferred<Annotation[]>();
    const createResponse = deferred<Annotation>();
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockReturnValue(initialLoad.promise);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "createAnnotation").mockReturnValue(createResponse.promise);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(annotator.on).toHaveBeenCalledWith(
        "createAnnotation",
        expect.any(Function),
      ),
    );

    annotator.addAnnotation(temporary);
    act(() => {
      listeners.get("createAnnotation")?.(temporary);
    });
    initialLoad.resolve([]);
    await act(async () => {
      await initialLoad.promise;
      await Promise.resolve();
    });

    expect(annotator.setAnnotations).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: temporary.id })],
      true,
    );
    expect(store.getAnnotation(temporary.id)).toBeDefined();

    createResponse.resolve(saved);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([saved]),
    );
    expect(store.getAnnotation(saved.id)).toMatchObject({ id: saved.id });
    expect(store.getAnnotation(temporary.id)).toBeUndefined();
  });

  it("deletes a pending create after it receives its backend ID", async () => {
    const temporary = {
      ...annotation(0, 0),
      id: "temporary-annotation",
    };
    const saved = annotation(1, 0);
    const createResponse = deferred<Annotation>();
    const { annotator, listeners, store } = createAnnotator();
    annotator.getSelected.mockReturnValue([{ id: temporary.id }]);
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "createAnnotation").mockReturnValue(createResponse.promise);
    const deleteAnnotation = vi
      .spyOn(api, "deleteAnnotation")
      .mockResolvedValue(undefined);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(annotator.on).toHaveBeenCalledWith(
        "createAnnotation",
        expect.any(Function),
      ),
    );
    act(() => {
      listeners.get("createAnnotation")?.(temporary);
      listeners.get("selectionChanged")?.([temporary]);
    });
    await waitFor(() =>
      expect(api.createAnnotation).toHaveBeenCalledWith(
        "slide.svs",
        expect.anything(),
      ),
    );

    expect(
      useViewerStore
        .getState()
        .annoActions?.cancelPendingCreate(temporary.id),
    ).toBe(true);
    expect(useAnnotationStore.getState().selectedId).toBeNull();
    expect(store.deleteAnnotation).toHaveBeenCalledWith(
      temporary.id,
      "REMOTE",
    );

    createResponse.resolve(saved);
    await waitFor(() =>
      expect(deleteAnnotation).toHaveBeenCalledWith("slide.svs", saved.id, {
        revision: saved.revision,
      }),
    );
    expect(useAnnotationStore.getState().annotations).toEqual([]);
    expect(store.addAnnotation).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id }),
      "REMOTE",
    );
  });

  it("persists the latest geometry when edits happen before create resolves", async () => {
    const temporary = {
      ...annotation(0, 0),
      id: "temporary-annotation",
    };
    const firstPendingEdit = {
      ...temporary,
      target: annotation(0, 5).target,
    };
    const latestPendingEdit = {
      ...temporary,
      target: annotation(0, 10).target,
    };
    const lateTemporaryIdEdit = {
      ...temporary,
      target: annotation(0, 25).target,
    };
    const created = annotation(1, 0);
    const firstSavedEdit = annotation(2, 10);
    const latestSavedEdit = annotation(3, 25);
    const createResponse = deferred<Annotation>();
    const firstUpdateResponse = deferred<Annotation>();
    const { annotator, listeners, store } = createAnnotator();
    annotator.getSelected.mockReturnValue([{ id: temporary.id }]);
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    const create = vi
      .spyOn(api, "createAnnotation")
      .mockImplementation(() => createResponse.promise);
    const update = vi
      .spyOn(api, "updateAnnotation")
      .mockImplementationOnce(() => firstUpdateResponse.promise)
      .mockResolvedValueOnce(latestSavedEdit);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(annotator.on).toHaveBeenCalledWith(
        "createAnnotation",
        expect.any(Function),
      ),
    );

    act(() => {
      listeners.get("createAnnotation")?.(temporary);
      listeners.get("updateAnnotation")?.(firstPendingEdit);
      listeners.get("updateAnnotation")?.(latestPendingEdit);
    });

    expect(create).toHaveBeenCalledWith("slide.svs", {
      body: temporary.body,
      target: temporary.target,
    });
    expect(update).not.toHaveBeenCalled();

    createResponse.resolve(created);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenNthCalledWith(1, "slide.svs", created.id, {
      body: created.body,
      target: latestPendingEdit.target,
      revision: 1,
    });
    expect(store.deleteAnnotation).toHaveBeenCalledWith(
      temporary.id,
      "REMOTE",
    );
    expect(annotator.setSelected).toHaveBeenCalledWith(created.id);

    // Annotorious may deliver an already-buffered event with the temporary ID
    // after the visual has been replaced. It must still join the saved-ID queue.
    act(() => {
      listeners.get("updateAnnotation")?.(lateTemporaryIdEdit);
    });
    expect(update).toHaveBeenCalledTimes(1);

    firstUpdateResponse.resolve(firstSavedEdit);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenNthCalledWith(2, "slide.svs", created.id, {
      body: firstSavedEdit.body,
      target: lateTemporaryIdEdit.target,
      revision: 2,
    });
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([
        latestSavedEdit,
      ]),
    );
  });

  it("ignores a pending create response after switching slides", async () => {
    const temporary = {
      ...annotation(0, 0),
      id: "temporary-annotation",
    };
    const edited = {
      ...temporary,
      target: annotation(0, 12).target,
    };
    const created = annotation(1, 0);
    const createResponse = deferred<Annotation>();
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "createAnnotation").mockImplementation(
      () => createResponse.promise,
    );
    const update = vi.spyOn(api, "updateAnnotation");

    const { rerender } = render(
      <AnnotationHandler file="first.svs" visible />,
    );
    await waitFor(() =>
      expect(annotator.on).toHaveBeenCalledWith(
        "createAnnotation",
        expect.any(Function),
      ),
    );
    const createListener = listeners.get("createAnnotation");
    const updateListener = listeners.get("updateAnnotation");

    act(() => {
      createListener?.(temporary);
      updateListener?.(edited);
    });
    await waitFor(() =>
      expect(api.createAnnotation).toHaveBeenCalledWith(
        "first.svs",
        expect.anything(),
      ),
    );

    rerender(<AnnotationHandler file="second.svs" visible />);
    await waitFor(() =>
      expect(api.getAnnotations).toHaveBeenCalledWith(
        "second.svs",
        expect.anything(),
      ),
    );
    store.addAnnotation.mockClear();
    store.updateAnnotation.mockClear();

    createResponse.resolve(created);
    await act(async () => {
      await createResponse.promise;
      await Promise.resolve();
    });

    expect(useAnnotationStore.getState().annotations).toEqual([]);
    expect(update).not.toHaveBeenCalled();
    expect(store.addAnnotation).not.toHaveBeenCalled();
    expect(store.updateAnnotation).not.toHaveBeenCalled();
    expect(annotator.setSelected).not.toHaveBeenCalled();
  });

  it("writes each saved revision back to Annotorious for consecutive edits", async () => {
    const first = annotation(1, 0);
    const firstEdit = annotation(1, 5);
    const second = annotation(2, 5);
    const secondEdit = annotation(2, 9);
    const third = annotation(3, 9);
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([first]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: 0.5,
      mpp_y: 0.5,
      objective_power: 40,
    });
    const update = vi
      .spyOn(api, "updateAnnotation")
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([first]),
    );
    useAnnotationStore.getState().setSelected(first.id);
    store.updateAnnotation.mockClear();

    await act(async () => {
      listeners.get("updateAnnotation")?.(firstEdit);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations[0].revision).toBe(2),
    );

    expect(update).toHaveBeenNthCalledWith(
      1,
      "slide.svs",
      first.id,
      expect.objectContaining({ revision: 1 }),
    );
    expect(store.updateAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: first.id, revision: 2 }),
      "REMOTE",
    );
    expect(annotator.removeAnnotation).not.toHaveBeenCalled();
    expect(annotator.setSelected).not.toHaveBeenCalled();

    await act(async () => {
      listeners.get("updateAnnotation")?.(secondEdit);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations[0].revision).toBe(3),
    );

    expect(update).toHaveBeenNthCalledWith(
      2,
      "slide.svs",
      first.id,
      expect.objectContaining({ revision: 2 }),
    );
    expect(store.updateAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: first.id, revision: 3 }),
      "REMOTE",
    );
    expect(useAnnotationStore.getState().selectedId).toBe(first.id);
  });

  it("restores the last persisted visual when an update fails", async () => {
    const persisted = annotation(4, 0);
    const edited = annotation(4, 20);
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([persisted]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "updateAnnotation").mockRejectedValue(
      new Error("Revision conflict"),
    );

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([persisted]),
    );
    store.updateAnnotation.mockClear();

    await act(async () => {
      listeners.get("updateAnnotation")?.(edited);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(useViewerStore.getState().error).toBe("Revision conflict"),
    );
    expect(store.updateAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: persisted.id,
        revision: persisted.revision,
        target: expect.objectContaining({
          selector: expect.objectContaining({
            geometry: expect.objectContaining({ x: 0 }),
          }),
        }),
      }),
      "REMOTE",
    );
    expect(useAnnotationStore.getState().annotations).toEqual([persisted]);
  });

  it("loads the latest annotation after a geometry revision conflict", async () => {
    const persisted = annotation(4, 0);
    const edited = annotation(4, 20);
    const latest = annotation(5, 8);
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([persisted]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "updateAnnotation").mockRejectedValue(
      new ApiError(409, "Revision conflict"),
    );
    vi.spyOn(api, "getAnnotation").mockResolvedValue(latest);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([persisted]),
    );
    store.updateAnnotation.mockClear();

    await act(async () => {
      listeners.get("updateAnnotation")?.(edited);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([latest]),
    );
    expect(store.updateAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: latest.id, revision: 5 }),
      "REMOTE",
    );
    expect(useViewerStore.getState().error).toContain(
      "latest version was loaded",
    );
  });

  it("serializes rapid geometry edits and reads the latest saved revision", async () => {
    const first = annotation(1, 0);
    const firstEdit = annotation(1, 5);
    const second = annotation(2, 5);
    const secondEdit = annotation(1, 9);
    const third = annotation(3, 9);
    const firstResponse = deferred<Annotation>();
    const { annotator, listeners } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockResolvedValue([first]);
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    const update = vi
      .spyOn(api, "updateAnnotation")
      .mockImplementationOnce(() => firstResponse.promise)
      .mockResolvedValueOnce(third);

    render(<AnnotationHandler file="slide.svs" visible />);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([first]),
    );

    act(() => {
      listeners.get("updateAnnotation")?.(firstEdit);
      listeners.get("updateAnnotation")?.(secondEdit);
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenNthCalledWith(
      1,
      "slide.svs",
      first.id,
      expect.objectContaining({ revision: 1 }),
    );

    firstResponse.resolve(second);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenNthCalledWith(
      2,
      "slide.svs",
      first.id,
      expect.objectContaining({
        revision: 2,
        target: secondEdit.target,
      }),
    );
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([third]),
    );
  });

  it("ignores a mutation response from a slide that is no longer active", async () => {
    const first = annotation(1, 0);
    const edited = annotation(1, 5);
    const saved = annotation(2, 5);
    const response = deferred<Annotation>();
    const { annotator, listeners, store } = createAnnotator();
    annotoriousMock.current = annotator;
    vi.spyOn(api, "getAnnotations").mockImplementation(async (file) =>
      file === "first.svs" ? [first] : [],
    );
    vi.spyOn(api, "getMpp").mockResolvedValue({
      mpp_x: null,
      mpp_y: null,
      objective_power: null,
    });
    vi.spyOn(api, "updateAnnotation").mockImplementation(() => response.promise);

    const { rerender } = render(
      <AnnotationHandler file="first.svs" visible />,
    );
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([first]),
    );

    act(() => {
      listeners.get("updateAnnotation")?.(edited);
    });
    await waitFor(() =>
      expect(api.updateAnnotation).toHaveBeenCalledWith(
        "first.svs",
        first.id,
        expect.anything(),
      ),
    );

    rerender(<AnnotationHandler file="second.svs" visible />);
    await waitFor(() =>
      expect(useAnnotationStore.getState().annotations).toEqual([]),
    );
    store.updateAnnotation.mockClear();

    response.resolve(saved);
    await act(async () => {
      await response.promise;
      await Promise.resolve();
    });

    expect(useAnnotationStore.getState().annotations).toEqual([]);
    expect(store.updateAnnotation).not.toHaveBeenCalled();
  });
});
