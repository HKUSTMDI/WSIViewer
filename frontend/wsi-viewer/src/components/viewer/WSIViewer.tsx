"use client";

import { useMemo, useCallback, useRef, useEffect } from "react";
import OpenSeadragon from "openseadragon";
import {
  Annotorious,
  OpenSeadragonAnnotator,
  OpenSeadragonViewer,
} from "@annotorious/react";
import "@annotorious/react/annotorious-react.css";
import { api } from "@/lib/api";
import { appPath } from "@/lib/deployment";
import { useViewerStore } from "@/stores/viewerStore";
import AnnotationHandler from "@/components/annotation/AnnotationHandler";
import type { Color, DrawingStyleExpression } from "@annotorious/react";
import { getAnnotationColor } from "@/features/annotation/body";

interface WSIViewerProps {
  file: string;
  onViewerReady?: (viewer: OpenSeadragon.Viewer) => void;
}

const annotationStyle: DrawingStyleExpression = (annotation, state) => {
  const adapted = annotation as unknown as {
    body?: unknown;
    bodies?: unknown;
  };
  const color = getAnnotationColor(adapted.body ?? adapted.bodies) as Color;
  return {
    fill: color,
    fillOpacity: state?.selected ? 0.35 : 0.2,
    stroke: state?.selected ? "#ff4444" : color,
    strokeOpacity: 1,
    strokeWidth: state?.selected ? 2.5 : 1.5,
  };
};

export default function WSIViewer({ file, onViewerReady }: WSIViewerProps) {
  const activeTool = useViewerStore((s) => s.activeTool);
  const showAnnotations = useViewerStore((s) => s.showAnnotations);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const callbackFired = useRef(false);

  // Freehand is handled by FreehandOverlay (canvas-based), not Annotorious
  const isDrawingTool =
    activeTool === "rectangle" ||
    activeTool === "circle" ||
    activeTool === "polygon";

  // Map tool names to Annotorious tool identifiers
  const annoTool = activeTool === "circle" ? "ellipse" : activeTool;

  const osdOptions = useMemo(
    () => ({
      tileSources: api.getDziUrl(file),
      prefixUrl: appPath("/osd-icons/"),
      showNavigator: true,
      navigatorPosition: "BOTTOM_RIGHT" as const,
      navigatorAutoFade: true,
      animationTime: 0.3,
      blendTime: 0.1,
      maxZoomPixelRatio: 4,
      minZoomImageRatio: 0.8,
      visibilityRatio: 0.5,
      constrainDuringPan: true,
      showNavigationControl: false,
      gestureSettingsMouse: {
        clickToZoom: false,
      },
    }),
    [file]
  );

  // Use ref callback to capture the OSD viewer instance
  const osdRef = useCallback(
    (viewer: OpenSeadragon.Viewer | null) => {
      viewerRef.current = viewer;
      if (viewer && !callbackFired.current) {
        callbackFired.current = true;
        onViewerReady?.(viewer);
      }
    },
    [onViewerReady]
  );

  // Reset callback flag when file changes
  useEffect(() => {
    callbackFired.current = false;
  }, [file]);

  return (
    <Annotorious>
      <OpenSeadragonAnnotator
        drawingEnabled={isDrawingTool}
        drawingMode="click"
        tool={isDrawingTool ? annoTool : "rectangle"}
        style={annotationStyle}
      >
        <OpenSeadragonViewer
          ref={osdRef}
          className="h-full w-full"
          options={osdOptions}
        />
        <AnnotationHandler file={file} visible={showAnnotations} />
      </OpenSeadragonAnnotator>
    </Annotorious>
  );
}
