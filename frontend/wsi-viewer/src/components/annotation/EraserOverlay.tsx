"use client";

import { useRef, useCallback, useEffect } from "react";
import OpenSeadragon from "openseadragon";
import { useViewerStore } from "@/stores/viewerStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { ApiError, api } from "@/lib/api";
import type { Annotation, AnnotationMutation } from "@/types/annotation";
import {
  clientToLocalPoint,
  imagePixelsPerScreenPixel,
} from "@/features/annotation/geometry/coordinates";
import { buildEraserArea, eraseMultiPolygon } from "@/features/annotation/geometry/eraser";
import {
  multiPolygonArea,
  multiPolygonToSelector,
  selectorToMultiPolygon,
} from "@/features/annotation/geometry/polygon";
import { enqueueAnnotationBatchMutation } from "@/features/annotation/mutationQueue";
import type { MultiPolygon, Point } from "@/features/annotation/geometry/types";

interface PendingChange {
  action: "delete" | "modify";
  original: Annotation;
  result: MultiPolygon;
}

interface EraserOverlayProps {
  viewer: OpenSeadragon.Viewer | null;
  file: string;
}

const MIN_FRAGMENT_AREA = 100;
const THROTTLE_MS = 50;

function getConflictAnnotationId(
  error: ApiError,
  changes: Map<string, PendingChange>,
): string | null {
  if (!error.payload || typeof error.payload !== "object") return null;
  const annotationId = (error.payload as { annotation_id?: unknown })
    .annotation_id;
  return typeof annotationId === "string" && changes.has(annotationId)
    ? annotationId
    : null;
}

export default function EraserOverlay({ viewer, file }: EraserOverlayProps) {
  const activeTool = useViewerStore((state) => state.activeTool);
  const eraserSize = useViewerStore((state) => state.eraserSize);
  const annoActions = useViewerStore((state) => state.annoActions);
  const setError = useViewerStore((state) => state.setError);
  const annotations = useAnnotationStore((state) => state.annotations);
  const removeAnnotation = useAnnotationStore((state) => state.removeAnnotation);
  const updateAnnotation = useAnnotationStore((state) => state.updateAnnotation);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const erasingRef = useRef(false);
  const committingGenerationRef = useRef<number | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const eraserImagePointsRef = useRef<Point[]>([]);
  const originalAnnotationsRef = useRef<Annotation[]>([]);
  const pendingChangesRef = useRef(new Map<string, PendingChange>());
  const lastEraseTimeRef = useRef(0);

  const viewerRef = useRef(viewer);
  const fileRef = useRef(file);
  const generationRef = useRef(0);
  const eraserSizeRef = useRef(eraserSize);
  const annoActionsRef = useRef(annoActions);
  const annotationsRef = useRef(annotations);
  const removeAnnotationRef = useRef(removeAnnotation);
  const updateAnnotationRef = useRef(updateAnnotation);
  const setErrorRef = useRef(setError);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);
  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    fileRef.current = file;
    erasingRef.current = false;
    activePointerRef.current = null;
    eraserImagePointsRef.current = [];
    originalAnnotationsRef.current = [];
    pendingChangesRef.current.clear();
    if (committingGenerationRef.current !== generation) {
      committingGenerationRef.current = null;
    }

    return () => {
      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [file]);
  useEffect(() => { eraserSizeRef.current = eraserSize; }, [eraserSize]);
  useEffect(() => { annoActionsRef.current = annoActions; }, [annoActions]);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { removeAnnotationRef.current = removeAnnotation; }, [removeAnnotation]);
  useEffect(() => { updateAnnotationRef.current = updateAnnotation; }, [updateAnnotation]);
  useEffect(() => { setErrorRef.current = setError; }, [setError]);

  const isActive = activeTool === "eraser";

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

  const getImageRadius = useCallback((): number => {
    const currentViewer = viewerRef.current;
    const item = currentViewer?.world.getItemAt(0);
    if (!currentViewer || !item) return eraserSizeRef.current / 2;
    const scale = imagePixelsPerScreenPixel(
      currentViewer.viewport.getBounds().width,
      item.getContentSize().x,
      currentViewer.viewport.getContainerSize().x,
    );
    return (eraserSizeRef.current / 2) * (scale ?? 1);
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

  const drawCursor = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncCanvasSize();
    const context = canvas.getContext("2d");
    const local = clientToLocalPoint(clientX, clientY, canvas.getBoundingClientRect());
    if (!context || !local) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#ef4444";
    context.lineWidth = 1.5;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(local.x, local.y, eraserSizeRef.current / 2, 0, 2 * Math.PI);
    context.stroke();
    context.fillStyle = "#ef4444";
    context.setLineDash([]);
    context.beginPath();
    context.arc(local.x, local.y, 2, 0, 2 * Math.PI);
    context.fill();
  }, [syncCanvasSize]);

  const restorePreview = useCallback(() => {
    const actions = annoActionsRef.current;
    if (actions) {
      const current = new Map(
        useAnnotationStore
          .getState()
          .annotations.map((annotation) => [annotation.id, annotation]),
      );
      for (const [annotationId, change] of pendingChangesRef.current) {
        const persisted = current.get(annotationId);
        if (persisted) actions.update(persisted);
        else if (change.action !== "delete") actions.removeVisual(annotationId);
      }
    }
    pendingChangesRef.current.clear();
  }, []);

  const computeErasePreview = useCallback(() => {
    const points = eraserImagePointsRef.current;
    const actions = annoActionsRef.current;
    const radius = getImageRadius();
    if (points.length === 0 || !actions || radius <= 0) return;
    const eraserArea = buildEraserArea(points, radius);
    if (eraserArea.length === 0) return;

    for (const annotation of originalAnnotationsRef.current) {
      const selector = annotation.target?.selector as Record<string, unknown> | undefined;
      if (!selector) continue;
      const source = selectorToMultiPolygon(selector);
      if (!source) continue;
      const result = eraseMultiPolygon(source, eraserArea, MIN_FRAGMENT_AREA);
      const removedArea = multiPolygonArea(source) - multiPolygonArea(result);
      if (removedArea <= 1e-6) continue;

      if (result.length === 0) {
        actions.removeVisual(annotation.id);
        pendingChangesRef.current.set(annotation.id, {
          action: "delete",
          original: annotation,
          result: [],
        });
        continue;
      }

      const nextSelector = multiPolygonToSelector(result);
      if (!nextSelector) continue;
      const preview = {
        ...annotation,
        target: { selector: nextSelector },
      };
      const previous = pendingChangesRef.current.get(annotation.id);
      if (previous?.action === "delete") actions.add(preview);
      else actions.update(preview);
      pendingChangesRef.current.set(annotation.id, {
        action: "modify",
        original: annotation,
        result,
      });
    }
  }, [getImageRadius]);

  const finalizeErase = useCallback(async () => {
    const slideId = fileRef.current;
    const generation = generationRef.current;
    const isCurrentOperation = () =>
      fileRef.current === slideId && generationRef.current === generation;
    if (
      !isCurrentOperation() ||
      committingGenerationRef.current === generation ||
      pendingChangesRef.current.size === 0
    ) {
      return;
    }
    committingGenerationRef.current = generation;
    const changes = new Map(pendingChangesRef.current);
    try {
      const response = await enqueueAnnotationBatchMutation(
        slideId,
        [...changes.keys()],
        async () => {
          if (!isCurrentOperation()) {
            return { created: [], updated: [], deleted: [] };
          }
          const current = new Map(
            useAnnotationStore
              .getState()
              .annotations.map((annotation) => [annotation.id, annotation]),
          );
          const operations: AnnotationMutation[] = [];
          for (const [annotationId, change] of changes) {
            const persisted = current.get(annotationId);
            if (!persisted) continue;
            if (
              JSON.stringify(persisted.target) !==
              JSON.stringify(change.original.target)
            ) {
              throw new Error(
                "Annotation geometry changed while erasing; the stroke was cancelled",
              );
            }
            if (change.action === "delete") {
              operations.push({
                action: "delete",
                annotation_id: annotationId,
                revision: persisted.revision,
              });
              continue;
            }
            const selector = multiPolygonToSelector(change.result);
            if (!selector) {
              throw new Error("Eraser produced invalid geometry");
            }
            operations.push({
              action: "update",
              annotation_id: annotationId,
              revision: persisted.revision,
              target: { selector },
            });
          }
          if (operations.length === 0) {
            return { created: [], updated: [], deleted: [] };
          }
          return api.applyAnnotationBatch(slideId, operations);
        },
      );
      if (!isCurrentOperation()) return;
      for (const annotationId of response.deleted) {
        removeAnnotationRef.current(annotationId);
      }
      for (const updated of response.updated) {
        updateAnnotationRef.current(updated.id, updated);
        annoActionsRef.current?.update(updated);
      }
    } catch (error) {
      if (!isCurrentOperation()) return;
      restorePreview();

      if (error instanceof ApiError && error.status === 409) {
        const annotationId = getConflictAnnotationId(error, changes);
        if (annotationId) {
          try {
            const latest = await api.getAnnotation(slideId, annotationId);
            if (!isCurrentOperation()) return;
            updateAnnotationRef.current(annotationId, latest);
            annoActionsRef.current?.update(latest);
            setErrorRef.current(
              "This annotation changed elsewhere. The latest version was loaded; erase it again to confirm.",
            );
          } catch (refreshError) {
            if (!isCurrentOperation()) return;
            if (
              refreshError instanceof ApiError &&
              refreshError.status === 404
            ) {
              removeAnnotationRef.current(annotationId);
              annoActionsRef.current?.removeVisual(annotationId);
              setErrorRef.current(
                "This annotation was already deleted elsewhere.",
              );
            } else {
              setErrorRef.current(
                refreshError instanceof Error
                  ? `The annotation changed elsewhere, but the latest version could not be loaded: ${refreshError.message}`
                  : "Failed to refresh the latest annotation",
              );
            }
          }
          return;
        }
      }

      setErrorRef.current(
        error instanceof Error ? error.message : "Failed to save eraser operation",
      );
    } finally {
      if (
        isCurrentOperation() &&
        committingGenerationRef.current === generation
      ) {
        committingGenerationRef.current = null;
        pendingChangesRef.current.clear();
        originalAnnotationsRef.current = [];
      }
    }
  }, [restorePreview]);

  const cancelStroke = useCallback(() => {
    restorePreview();
    erasingRef.current = false;
    activePointerRef.current = null;
    eraserImagePointsRef.current = [];
    originalAnnotationsRef.current = [];
    clearCanvas();
  }, [clearCanvas, restorePreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    syncCanvasSize();

    const onPointerDown = (event: PointerEvent) => {
      if (
        !viewerRef.current ||
        committingGenerationRef.current === generationRef.current ||
        erasingRef.current ||
        !event.isPrimary
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setErrorRef.current(null);
      const point = screenToImage(event.clientX, event.clientY);
      if (!point) return;
      erasingRef.current = true;
      activePointerRef.current = event.pointerId;
      eraserImagePointsRef.current = [point];
      originalAnnotationsRef.current = [...annotationsRef.current];
      pendingChangesRef.current.clear();
      lastEraseTimeRef.current = 0;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      drawCursor(event.clientX, event.clientY);
      if (!erasingRef.current || activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const point = screenToImage(event.clientX, event.clientY);
      const previous = eraserImagePointsRef.current.at(-1);
      if (point && (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 1)) {
        eraserImagePointsRef.current.push(point);
      }
      const now = Date.now();
      if (now - lastEraseTimeRef.current >= THROTTLE_MS) {
        lastEraseTimeRef.current = now;
        computeErasePreview();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!erasingRef.current || activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      erasingRef.current = false;
      activePointerRef.current = null;
      computeErasePreview();
      eraserImagePointsRef.current = [];
      void finalizeErase();
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (activePointerRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      cancelStroke();
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
  }, [
    isActive,
    screenToImage,
    drawCursor,
    computeErasePreview,
    finalizeErase,
    cancelStroke,
    syncCanvasSize,
  ]);

  useEffect(() => {
    if (
      !isActive &&
      committingGenerationRef.current !== generationRef.current
    ) {
      cancelStroke();
    }
  }, [isActive, cancelStroke]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Annotation eraser canvas"
      className="absolute inset-0"
      style={{
        zIndex: 30,
        pointerEvents: isActive ? "auto" : "none",
        cursor: isActive ? "none" : "default",
        touchAction: "none",
        display: isActive ? "block" : "none",
      }}
    />
  );
}
