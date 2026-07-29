"use client";

import { useEffect, useRef } from "react";
import type OpenSeadragon from "openseadragon";
import type { ActiveTool } from "@/types/viewer";

type ViewerWithMouseGestures = OpenSeadragon.Viewer & {
  gestureSettingsMouse?: {
    clickToZoom: boolean;
    dblClickToZoom: boolean;
  };
};

function applyNavigationMode(
  viewer: OpenSeadragon.Viewer,
  activeTool: ActiveTool,
) {
  const isPan = activeTool === "pan";
  viewer.setMouseNavEnabled(isPan);

  const gestures = (viewer as ViewerWithMouseGestures).gestureSettingsMouse;
  if (gestures) {
    gestures.clickToZoom = false;
    gestures.dblClickToZoom = isPan;
  }
}

/**
 * Keeps OpenSeadragon navigation consistent with the selected application tool.
 *
 * Annotorious temporarily disables OSD navigation while an annotation handle is
 * being dragged, and enables it after drawing. The former is allowed while Pan
 * is active; the latter is immediately rejected for every non-Pan tool.
 */
export function useViewerNavigationPolicy(
  viewer: OpenSeadragon.Viewer | null,
  activeTool: ActiveTool,
) {
  const activeToolRef = useRef(activeTool);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    if (!viewer) return;

    let disposed = false;

    const handleMouseEnabled = (event: OpenSeadragon.MouseEnabledEvent) => {
      if (event.enabled && activeToolRef.current !== "pan") {
        viewer.setMouseNavEnabled(false);
      }
    };

    const restorePanAfterGesture = () => {
      queueMicrotask(() => {
        if (
          !disposed &&
          activeToolRef.current === "pan" &&
          !viewer.isMouseNavEnabled()
        ) {
          viewer.setMouseNavEnabled(true);
        }
      });
    };

    viewer.addHandler("mouse-enabled", handleMouseEnabled);
    window.addEventListener("pointerup", restorePanAfterGesture, true);
    window.addEventListener("pointercancel", restorePanAfterGesture, true);
    window.addEventListener("blur", restorePanAfterGesture);

    return () => {
      disposed = true;
      viewer.removeHandler("mouse-enabled", handleMouseEnabled);
      window.removeEventListener("pointerup", restorePanAfterGesture, true);
      window.removeEventListener("pointercancel", restorePanAfterGesture, true);
      window.removeEventListener("blur", restorePanAfterGesture);
    };
  }, [viewer]);

  useEffect(() => {
    if (viewer) applyNavigationMode(viewer, activeTool);
  }, [viewer, activeTool]);
}
