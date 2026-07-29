import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type OpenSeadragon from "openseadragon";
import { useViewerNavigationPolicy } from "./useViewerNavigationPolicy";
import type { ActiveTool } from "@/types/viewer";

type MouseEnabledHandler = (event: OpenSeadragon.MouseEnabledEvent) => void;

function createViewer(
  initiallyEnabled = true,
  withGestureSettings = true,
) {
  let enabled = initiallyEnabled;
  const handlers = new Set<MouseEnabledHandler>();
  const gestureSettingsMouse = withGestureSettings
    ? { clickToZoom: true, dblClickToZoom: false }
    : undefined;

  const viewer = {
    gestureSettingsMouse,
    setMouseNavEnabled: vi.fn((next: boolean) => {
      enabled = next;
      for (const handler of handlers) {
        handler({ enabled: next } as OpenSeadragon.MouseEnabledEvent);
      }
      return viewer;
    }),
    isMouseNavEnabled: vi.fn(() => enabled),
    addHandler: vi.fn(
      (name: string, handler: MouseEnabledHandler) => {
        if (name === "mouse-enabled") handlers.add(handler);
        return viewer;
      },
    ),
    removeHandler: vi.fn(
      (name: string, handler: MouseEnabledHandler) => {
        if (name === "mouse-enabled") handlers.delete(handler);
        return viewer;
      },
    ),
  };

  return {
    viewer: viewer as unknown as OpenSeadragon.Viewer,
    gestureSettingsMouse,
    isEnabled: () => enabled,
  };
}

async function dispatchGestureEnd(type: "pointerup" | "pointercancel" | "blur") {
  await act(async () => {
    window.dispatchEvent(new Event(type));
    await Promise.resolve();
  });
}

describe("useViewerNavigationPolicy", () => {
  it("enables navigation only for Pan and configures mouse zoom gestures", () => {
    const fake = createViewer(false);
    const { rerender } = renderHook(
      ({ tool }: { tool: ActiveTool }) =>
        useViewerNavigationPolicy(fake.viewer, tool),
      { initialProps: { tool: "pan" } },
    );

    expect(fake.isEnabled()).toBe(true);
    expect(fake.gestureSettingsMouse).toEqual({
      clickToZoom: false,
      dblClickToZoom: true,
    });

    rerender({ tool: "circle" });

    expect(fake.isEnabled()).toBe(false);
    expect(fake.gestureSettingsMouse).toEqual({
      clickToZoom: false,
      dblClickToZoom: false,
    });
  });

  it("rejects Annotorious attempts to re-enable navigation for a drawing tool", () => {
    const fake = createViewer();
    renderHook(() => useViewerNavigationPolicy(fake.viewer, "rectangle"));

    act(() => {
      fake.viewer.setMouseNavEnabled(true);
    });

    expect(fake.isEnabled()).toBe(false);
    expect(fake.viewer.setMouseNavEnabled).toHaveBeenLastCalledWith(false);
  });

  it.each(["pointerup", "pointercancel", "blur"] as const)(
    "restores Pan after a temporary Annotorious disable on %s",
    async (eventType) => {
      const fake = createViewer();
      renderHook(() => useViewerNavigationPolicy(fake.viewer, "pan"));
      act(() => {
        fake.viewer.setMouseNavEnabled(false);
      });

      expect(fake.isEnabled()).toBe(false);
      await dispatchGestureEnd(eventType);
      expect(fake.isEnabled()).toBe(true);
    },
  );

  it("restores Pan when the pointer ends on the sidebar delete control", async () => {
    const fake = createViewer();
    const deleteButton = document.createElement("button");
    document.body.appendChild(deleteButton);
    renderHook(() => useViewerNavigationPolicy(fake.viewer, "pan"));
    act(() => {
      fake.viewer.setMouseNavEnabled(false);
    });

    await act(async () => {
      deleteButton.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(fake.isEnabled()).toBe(true);
  });

  it("does not restore navigation after a gesture when a non-Pan tool is active", async () => {
    const fake = createViewer();
    renderHook(() => useViewerNavigationPolicy(fake.viewer, "eraser"));

    await dispatchGestureEnd("pointerup");

    expect(fake.isEnabled()).toBe(false);
    expect(fake.viewer.setMouseNavEnabled).toHaveBeenCalledTimes(1);
  });

  it("uses the latest tool when a queued gesture restoration runs", async () => {
    const fake = createViewer();
    const { rerender } = renderHook(
      ({ tool }: { tool: ActiveTool }) =>
        useViewerNavigationPolicy(fake.viewer, tool),
      { initialProps: { tool: "pan" } },
    );
    act(() => {
      fake.viewer.setMouseNavEnabled(false);
      window.dispatchEvent(new Event("pointerup"));
      rerender({ tool: "polygon" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fake.isEnabled()).toBe(false);
  });

  it("removes listeners and ignores queued restoration after unmount", async () => {
    const fake = createViewer();
    const { unmount } = renderHook(() =>
      useViewerNavigationPolicy(fake.viewer, "pan"),
    );
    act(() => {
      fake.viewer.setMouseNavEnabled(false);
      window.dispatchEvent(new Event("pointerup"));
      unmount();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fake.isEnabled()).toBe(false);
    expect(fake.viewer.removeHandler).toHaveBeenCalledWith(
      "mouse-enabled",
      expect.any(Function),
    );
  });

  it("supports a not-yet-ready viewer and viewers without mutable gesture settings", () => {
    const fake = createViewer(true, false);
    const { rerender } = renderHook(
      ({ currentViewer }: { currentViewer: OpenSeadragon.Viewer | null }) =>
        useViewerNavigationPolicy(currentViewer, "pan"),
      {
        initialProps: {
          currentViewer: null as OpenSeadragon.Viewer | null,
        },
      },
    );

    expect(fake.viewer.setMouseNavEnabled).not.toHaveBeenCalled();
    rerender({ currentViewer: fake.viewer });
    expect(fake.isEnabled()).toBe(true);
  });
});
