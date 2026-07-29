"use client";

import { useRef, useCallback, useEffect } from "react";
import OpenSeadragon from "openseadragon";
import { useViewerStore } from "@/stores/viewerStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { api, isAbortError } from "@/lib/api";
import {
  clientToLocalPoint,
  imagePixelsPerScreenPixel,
} from "@/features/annotation/geometry/coordinates";
import {
  buildFreehandSelector,
  shouldAppendSample,
} from "@/features/annotation/geometry/freehand";
import type { Point } from "@/features/annotation/geometry/types";

interface FreehandOverlayProps {
  viewer: OpenSeadragon.Viewer | null;
  file: string;
}

const PEN_CURSOR = [
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27',
  " viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%233b82f6%27 stroke-width=%272%27",
  " stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E",
  "%3Cpath d=%27M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z%27/%3E",
  '%3C/svg%3E") 2 22, crosshair',
].join("");

export default function FreehandOverlay({
  viewer,
  file,
}: FreehandOverlayProps) {
  const activeTool = useViewerStore((state) => state.activeTool);
  const setError = useViewerStore((state) => state.setError);
  const addAnnotation = useAnnotationStore((state) => state.addAnnotation);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const screenPointsRef = useRef<Point[]>([]);
  const imagePointsRef = useRef<Point[]>([]);
  const saveControllersRef = useRef(new Set<AbortController>());

  const viewerRef = useRef(viewer);
  const fileRef = useRef(file);
  const addAnnotationRef = useRef(addAnnotation);
  const setErrorRef = useRef(setError);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);
  useEffect(() => { fileRef.current = file; }, [file]);
  useEffect(() => { addAnnotationRef.current = addAnnotation; }, [addAnnotation]);
  useEffect(() => { setErrorRef.current = setError; }, [setError]);

  const isActive = activeTool === "freehand";

  const screenToImage = useCallback((clientX: number, clientY: number): Point | null => {
    const currentViewer = viewerRef.current;
    if (!currentViewer) return null;
    const local = clientToLocalPoint(
      clientX,
      clientY,
      currentViewer.element.getBoundingClientRect(),
    );
    if (!local) return null;
    const viewportPoint = currentViewer.viewport.pointFromPixel(
      new OpenSeadragon.Point(local.x, local.y),
    );
    const item = currentViewer.world.getItemAt(0);
    if (!item) return null;
    const imagePoint = item.viewportToImageCoordinates(viewportPoint);
    if (!Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)) return null;
    return { x: imagePoint.x, y: imagePoint.y };
  }, []);

  const getSimplifyTolerance = useCallback((): number => {
    const currentViewer = viewerRef.current;
    const item = currentViewer?.world.getItemAt(0);
    if (!currentViewer || !item) return 10;
    const scale = imagePixelsPerScreenPixel(
      currentViewer.viewport.getBounds().width,
      item.getContentSize().x,
      currentViewer.viewport.getContainerSize().x,
    );
    return Math.max(3, (scale ?? 5) * 2);
  }, []);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
    if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncCanvasSize();
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const points = screenPointsRef.current;
    if (points.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    context.strokeStyle = "#3b82f6";
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.fillStyle = "rgba(59, 130, 246, 0.15)";
    context.beginPath();
    context.moveTo(points[0].x - rect.left, points[0].y - rect.top);
    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x - rect.left, points[i].y - rect.top);
    }
    context.closePath();
    context.fill();
    context.stroke();
  }, [syncCanvasSize]);

  const resetStroke = useCallback(() => {
    drawingRef.current = false;
    activePointerRef.current = null;
    screenPointsRef.current = [];
    imagePointsRef.current = [];
    clearCanvas();
  }, [clearCanvas]);

  const saveDrawing = useCallback(async (points: Point[]) => {
    const selector = buildFreehandSelector(points, getSimplifyTolerance());
    if (!selector) {
      if (points.length >= 3) {
        setErrorRef.current("Freehand path is too small or self-intersecting");
      }
      return;
    }
    const slideId = fileRef.current;
    const controller = new AbortController();
    saveControllersRef.current.add(controller);
    try {
      const saved = await api.createAnnotation(
        slideId,
        { body: [], target: { selector } },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted && fileRef.current === slideId) {
        addAnnotationRef.current(saved);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setErrorRef.current(
          error instanceof Error ? error.message : "Failed to save freehand annotation",
        );
      }
    } finally {
      saveControllersRef.current.delete(controller);
    }
  }, [getSimplifyTolerance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    syncCanvasSize();

    const onPointerDown = (event: PointerEvent) => {
      if (!viewerRef.current || drawingRef.current || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      setErrorRef.current(null);
      drawingRef.current = true;
      activePointerRef.current = event.pointerId;
      screenPointsRef.current = [{ x: event.clientX, y: event.clientY }];
      const imagePoint = screenToImage(event.clientX, event.clientY);
      imagePointsRef.current = imagePoint ? [imagePoint] : [];
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drawingRef.current || activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const screenPoint = { x: event.clientX, y: event.clientY };
      if (!shouldAppendSample(screenPointsRef.current.at(-1), screenPoint)) return;
      const imagePoint = screenToImage(event.clientX, event.clientY);
      if (!imagePoint) return;
      screenPointsRef.current.push(screenPoint);
      imagePointsRef.current.push(imagePoint);
      drawPreview();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!drawingRef.current || activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const points = [...imagePointsRef.current];
      resetStroke();
      void saveDrawing(points);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      resetStroke();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [isActive, screenToImage, drawPreview, resetStroke, saveDrawing, syncCanvasSize]);

  useEffect(() => {
    if (!isActive) resetStroke();
  }, [isActive, resetStroke]);

  useEffect(() => () => {
    for (const controller of saveControllersRef.current) controller.abort();
    saveControllersRef.current.clear();
  }, [file]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Freehand annotation canvas"
      className="absolute inset-0"
      style={{
        zIndex: 30,
        pointerEvents: isActive ? "auto" : "none",
        cursor: isActive ? PEN_CURSOR : "default",
        touchAction: "none",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
