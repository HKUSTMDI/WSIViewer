import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type OpenSeadragon from "openseadragon";
import MeasureOverlay from "./MeasureOverlay";
import { useViewerStore } from "@/stores/viewerStore";

type ViewerHandler = () => void;

function createViewer(element: HTMLElement) {
  const handlers = new Map<string, ViewerHandler>();
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });

  const viewer = {
    element,
    viewport: {
      pointFromPixel: (point: OpenSeadragon.Point) => point,
      viewportToWindowCoordinates: (point: OpenSeadragon.Point) => point,
    },
    world: {
      getItemAt: () => ({
        viewportToImageCoordinates: (point: OpenSeadragon.Point) => point,
        imageToViewportCoordinates: (point: OpenSeadragon.Point) => point,
      }),
    },
    addHandler: vi.fn((event: string, handler: ViewerHandler) => {
      handlers.set(event, handler);
    }),
    removeHandler: vi.fn((event: string, handler: ViewerHandler) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
  } as unknown as OpenSeadragon.Viewer;

  return { viewer, handlers };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  useViewerStore.setState({
    activeTool: "measure-angle",
    mpp: { mpp_x: 1, mpp_y: 2, objective_power: 40 },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MeasureOverlay", () => {
  it("renders an angle calculated with independent X/Y MPP", async () => {
    const host = document.createElement("div");
    const { viewer } = createViewer(host);
    const { getByLabelText } = render(
      <div>
        <MeasureOverlay key="slide-a.svs" viewer={viewer} />
      </div>,
    );
    const canvas = getByLabelText("Measurement canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d");

    fireEvent.click(canvas, { clientX: 1, clientY: 0 });
    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(canvas, { clientX: 1, clientY: 1 });

    await waitFor(() =>
      expect(context?.fillText).toHaveBeenCalledWith(
        "63.4°",
        expect.any(Number),
        expect.any(Number),
      ),
    );
  });

  it("clears completed measurements when the slide changes", async () => {
    useViewerStore.setState({
      activeTool: "measure-length",
      mpp: { mpp_x: 1, mpp_y: 1, objective_power: 40 },
    });
    const host = document.createElement("div");
    const { viewer, handlers } = createViewer(host);
    const { getByLabelText, rerender } = render(
      <div>
        <MeasureOverlay key="slide-a.svs" viewer={viewer} />
      </div>,
    );
    const canvas = getByLabelText("Measurement canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d");

    fireEvent.click(canvas, { clientX: 0, clientY: 0 });
    fireEvent.click(canvas, { clientX: 10, clientY: 0 });
    await waitFor(() =>
      expect(context?.fillText).toHaveBeenCalledWith(
        "10.0 μm",
        expect.any(Number),
        expect.any(Number),
      ),
    );

    rerender(
      <div>
        <MeasureOverlay key="slide-b.svs" viewer={viewer} />
      </div>,
    );
    const nextCanvas = getByLabelText(
      "Measurement canvas",
    ) as HTMLCanvasElement;
    const nextContext = nextCanvas.getContext("2d");
    vi.mocked(nextContext!.fillText).mockClear();
    act(() => {
      handlers.get("resize")?.();
    });

    expect(nextContext?.fillText).not.toHaveBeenCalled();
  });
});
