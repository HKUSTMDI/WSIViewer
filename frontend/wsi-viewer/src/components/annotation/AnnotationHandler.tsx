"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Origin,
  parseW3CImageAnnotation,
  useAnnotator,
  type AnnotoriousOpenSeadragonAnnotator,
} from "@annotorious/react";
import { mountPlugin as mountToolsPlugin } from "@annotorious/plugin-tools";
import "@annotorious/plugin-tools/annotorious-plugin-tools.css";
import { ApiError, api, isAbortError } from "@/lib/api";
import { boundsFromCoordinates } from "@/features/annotation/geometry/polygon";
import type { Coordinate } from "@/features/annotation/geometry/types";
import { enqueueAnnotationMutation } from "@/features/annotation/mutationQueue";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import type { Annotation as ApiAnnotation } from "@/types/annotation";

interface AnnotationHandlerProps {
  file: string;
  visible: boolean;
}

interface PendingCreate {
  latestTarget: ApiAnnotation["target"];
  hasGeometryUpdate: boolean;
  cancelled: boolean;
  savedId?: string;
}

function withLegacyPolygonBounds(annotation: ApiAnnotation): ApiAnnotation {
  const selector = annotation.target?.selector;
  const geometry =
    selector?.type === "POLYGON" &&
    selector.geometry &&
    typeof selector.geometry === "object"
      ? (selector.geometry as Record<string, unknown>)
      : null;
  if (!geometry || geometry.bounds || !Array.isArray(geometry.points)) {
    return annotation;
  }

  const points: Coordinate[] = [];
  for (const point of geometry.points) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      return annotation;
    }
    points.push([point[0], point[1]]);
  }

  const bounds = boundsFromCoordinates(points);
  if (!bounds) return annotation;
  return {
    ...annotation,
    target: {
      ...annotation.target,
      selector: {
        ...selector,
        geometry: { ...geometry, bounds },
      },
    },
  };
}

export function parseApiAnnotationForAnnotorious(annotation: ApiAnnotation) {
  const normalized = withLegacyPolygonBounds(annotation);
  const result = parseW3CImageAnnotation(
    normalized as unknown as Parameters<typeof parseW3CImageAnnotation>[0],
    { strict: false, invertY: false },
  );
  if (!result.parsed) {
    throw result.error ?? new Error("Failed to parse annotation");
  }
  return result.parsed;
}

function mergeLoadedAnnotations(
  loaded: ApiAnnotation[],
  current: ApiAnnotation[],
): ApiAnnotation[] {
  const merged = new Map(loaded.map((annotation) => [annotation.id, annotation]));
  for (const annotation of current) {
    const serverVersion = merged.get(annotation.id);
    if (!serverVersion || annotation.revision >= serverVersion.revision) {
      merged.set(annotation.id, annotation);
    }
  }
  return [...merged.values()];
}

/**
 * Headless component that wires Annotorious events to our stores and backend API.
 * Must be rendered inside <OpenSeadragonAnnotator>.
 */
export default function AnnotationHandler({
  file,
  visible,
}: AnnotationHandlerProps) {
  const anno = useAnnotator<AnnotoriousOpenSeadragonAnnotator>();
  const pluginMounted = useRef(false);

  const annotations = useAnnotationStore((s) => s.annotations);
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation);
  const setSelected = useAnnotationStore((s) => s.setSelected);
  const setMpp = useViewerStore((s) => s.setMpp);
  const setAnnoActions = useViewerStore((s) => s.setAnnoActions);
  const setError = useViewerStore((s) => s.setError);

  // Track which annotation IDs are already in Annotorious to avoid double-adds
  const annoIdsRef = useRef<Set<string>>(new Set());
  const pendingCreatesRef = useRef(new Map<string, PendingCreate>());

  const removeVisualAnnotation = useCallback(
    (id: string) => {
      if (!anno) return;
      // REMOTE changes update Annotorious without re-emitting a lifecycle event
      // that would otherwise call the backend a second time.
      anno.state.store.deleteAnnotation(id, Origin.REMOTE);
      annoIdsRef.current.delete(id);
    },
    [anno],
  );

  const replaceVisualAnnotation = useCallback(
    (annotation: ApiAnnotation) => {
      if (!anno || !annotation.id) return;
      const parsed = parseApiAnnotationForAnnotorious(annotation);

      if (anno.state.store.getAnnotation(annotation.id)) {
        anno.state.store.updateAnnotation(parsed, Origin.REMOTE);
      } else {
        anno.state.store.addAnnotation(parsed, Origin.REMOTE);
      }
      annoIdsRef.current.add(annotation.id);
    },
    [anno],
  );

  // Mount plugin-tools (ellipse, line, path)
  useEffect(() => {
    if (!anno || pluginMounted.current) return;
    try {
      mountToolsPlugin(anno);
      pluginMounted.current = true;
    } catch {
      // plugin already mounted
    }
  }, [anno]);

  // Expose Annotorious operations via store for components outside the tree
  useEffect(() => {
    if (!anno) return;
    setAnnoActions({
      add: (ann) => {
        try {
          replaceVisualAnnotation(ann as ApiAnnotation);
        } catch (e) {
          console.error("Failed to add annotation to Annotorious:", e);
        }
      },
      remove: (id) => {
        try {
          removeVisualAnnotation(id);
        } catch (e) {
          console.error("Failed to remove annotation from Annotorious:", e);
        }
      },
      update: (ann) => {
        replaceVisualAnnotation(ann as ApiAnnotation);
      },
      removeVisual: (id) => {
        removeVisualAnnotation(id);
      },
      select: (id) => {
        try {
          if (id) {
            anno.setSelected(id);
          } else {
            anno.cancelSelected();
          }
        } catch { /* ignore */ }
      },
      cancelPendingCreate: (id) => {
        const pending = pendingCreatesRef.current.get(id);
        if (!pending || pending.savedId) return false;
        pending.cancelled = true;
        removeVisualAnnotation(id);
        setSelected(null);
        return true;
      },
    });
    return () => setAnnoActions(null);
  }, [
    anno,
    removeVisualAnnotation,
    replaceVisualAnnotation,
    setSelected,
    setAnnoActions,
  ]);

  // Toggle visibility
  useEffect(() => {
    if (!anno) return;
    anno.setVisible(visible);
  }, [anno, visible]);

  // Load existing annotations + MPP on mount
  useEffect(() => {
    if (!anno) return;

    const controller = new AbortController();

    anno.setAnnotations([], true);
    annoIdsRef.current.clear();
    setAnnotations([]);
    setMpp(null);
    setError(null);

    api
      .getAnnotations(file, { signal: controller.signal })
      .then((anns: ApiAnnotation[]) => {
        if (controller.signal.aborted) return;
        const merged = mergeLoadedAnnotations(
          anns,
          useAnnotationStore.getState().annotations,
        );
        const parsed = merged.map(parseApiAnnotationForAnnotorious);
        const pendingIds = new Set(
          [...pendingCreatesRef.current]
            .filter(([, pending]) => !pending.cancelled && !pending.savedId)
            .map(([id]) => id),
        );
        const pendingVisuals = (
          anno.getAnnotations() as Array<{ id?: string }>
        ).filter(
          (annotation): annotation is { id: string } =>
            Boolean(annotation.id && pendingIds.has(annotation.id)),
        );
        setAnnotations(merged);
        anno.setAnnotations(
          [...parsed, ...pendingVisuals] as Parameters<
            typeof anno.setAnnotations
          >[0],
          true,
        );
        annoIdsRef.current = new Set([
          ...merged.map((annotation) => annotation.id),
          ...pendingVisuals.map((annotation) => annotation.id),
        ]);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setError(error instanceof Error ? error.message : "Failed to load annotations");
        }
      });

    api
      .getMpp(file, { signal: controller.signal })
      .then((mpp) => {
        if (!controller.signal.aborted) setMpp(mpp);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) console.error("Failed to load MPP:", error);
      });

    return () => controller.abort();
  }, [anno, file, setAnnotations, setMpp, setError]);

  // ── Sync store → Annotorious ──────────────────────────────────────
  // When annotations are added to the store from outside Annotorious
  // (e.g. freehand, eraser updates), sync them into Annotorious.
  useEffect(() => {
    if (!anno) return;

    for (const ann of annotations) {
      if (!annoIdsRef.current.has(ann.id)) {
        try {
          replaceVisualAnnotation(ann);
        } catch (e) {
          console.error("Sync: failed to add annotation to Annotorious:", ann.id, e);
        }
      }
    }

    // Remove from Annotorious any IDs no longer in the store.
    // Apply cleanup as a REMOTE store change so no backend event is emitted.
    const storeIds = new Set(annotations.map((a) => a.id));
    for (const id of annoIdsRef.current) {
      const isPendingCreate =
        pendingCreatesRef.current.has(id) &&
        !pendingCreatesRef.current.get(id)?.savedId;
      if (!storeIds.has(id) && !isPendingCreate) {
        removeVisualAnnotation(id);
      }
    }
  }, [
    anno,
    annotations,
    removeVisualAnnotation,
    replaceVisualAnnotation,
  ]);

  // Wire events
  useEffect(() => {
    if (!anno) return;
    let active = true;
    // Annotorious can emit geometry updates while the create request is still
    // waiting for the backend-assigned ID. Keep a slide-local alias so those
    // edits can be replayed against the saved ID instead of being discarded.
    const pendingCreates = pendingCreatesRef.current;

    const persistGeometryUpdate = (
      annotationId: string,
      requestedTarget: ApiAnnotation["target"],
    ) => {
      setError(null);

      void enqueueAnnotationMutation(file, annotationId, async () => {
        if (!active) return;
        const current = useAnnotationStore
          .getState()
          .annotations.find((item) => item.id === annotationId);
        if (!current) return;

        try {
          const saved = await api.updateAnnotation(file, annotationId, {
            body: current.body,
            target: requestedTarget,
            revision: current.revision,
          });
          if (!active) return;
          updateAnnotation(saved.id, saved);
          replaceVisualAnnotation(saved);
        } catch (error) {
          if (!active) return;

          if (error instanceof ApiError && error.status === 409) {
            try {
              const latest = await api.getAnnotation(file, annotationId);
              if (!active) return;
              updateAnnotation(annotationId, latest);
              replaceVisualAnnotation(latest);
              setError(
                "This annotation changed elsewhere. The latest version was loaded; redraw your change.",
              );
            } catch (refreshError) {
              if (!active) return;
              if (
                refreshError instanceof ApiError &&
                refreshError.status === 404
              ) {
                removeAnnotation(annotationId);
                removeVisualAnnotation(annotationId);
                setError("This annotation was deleted elsewhere.");
              } else {
                setError(
                  refreshError instanceof Error
                    ? `The annotation changed elsewhere, but the latest version could not be loaded: ${refreshError.message}`
                    : "Failed to refresh the latest annotation",
                );
              }
            }
            return;
          }

          if (error instanceof ApiError && error.status === 404) {
            removeAnnotation(annotationId);
            removeVisualAnnotation(annotationId);
            setError("This annotation was deleted elsewhere.");
            return;
          }

          replaceVisualAnnotation(current);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to update annotation",
          );
        }
      }).catch((error: unknown) => {
        if (active) {
          setError(
            error instanceof Error ? error.message : "Failed to update annotation",
          );
        }
      });
    };

    const handleCreate = (annotation: unknown) => {
      const ann = annotation as unknown as ApiAnnotation;
      const originalId = ann.id;
      const pending: PendingCreate = {
        latestTarget: ann.target,
        hasGeometryUpdate: false,
        cancelled: false,
      };
      pendingCreates.set(originalId, pending);
      setError(null);
      void api
        .createAnnotation(file, {
          body: ann.body,
          target: ann.target,
        })
        .then((saved) => {
          if (pending.cancelled) {
            pending.savedId = saved.id;
            pendingCreates.delete(originalId);
            void enqueueAnnotationMutation(file, saved.id, async () => {
              try {
                await api.deleteAnnotation(file, saved.id, {
                  revision: saved.revision,
                });
              } catch (error) {
                if (error instanceof ApiError && error.status === 404) return;

                let restored = saved;
                if (error instanceof ApiError && error.status === 409) {
                  try {
                    restored = await api.getAnnotation(file, saved.id);
                  } catch (refreshError) {
                    if (
                      refreshError instanceof ApiError &&
                      refreshError.status === 404
                    ) {
                      return;
                    }
                  }
                }

                if (active) {
                  addAnnotation(restored);
                  replaceVisualAnnotation(restored);
                  setError(
                    error instanceof Error
                      ? `The cancelled annotation was created, but could not be deleted: ${error.message}`
                      : "The cancelled annotation was created, but could not be deleted",
                  );
                }
              }
            });
            return;
          }
          if (!active) return;
          // Ignore a superseded create event that happened to reuse a temp ID.
          if (pendingCreates.get(originalId) !== pending) return;
          pending.savedId = saved.id;

          // Replace the Annotorious annotation (temp ID) with the saved one (backend ID)
          // so that sidebar select/delete uses the correct ID.
          const wasSelected = (
            anno.getSelected() as Array<{ id?: string }>
          ).some((selected) => selected.id === originalId);
          removeVisualAnnotation(originalId);
          try {
            // Display the newest local geometry under the backend ID immediately.
            // The REMOTE origin avoids firing another create/update lifecycle event.
            replaceVisualAnnotation({
              ...saved,
              target: pending.hasGeometryUpdate
                ? pending.latestTarget
                : saved.target,
            });
            if (wasSelected) anno.setSelected(saved.id);
          } catch (e) {
            console.error("Failed to re-add annotation after ID replacement:", e);
          }
          addAnnotation(saved);

          if (pending.hasGeometryUpdate) {
            // This enters the normal per-annotation queue before any later edits
            // on the saved ID, so revision ordering remains deterministic.
            persistGeometryUpdate(saved.id, pending.latestTarget);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (pendingCreates.get(originalId) === pending) {
            pendingCreates.delete(originalId);
          }
          removeVisualAnnotation(originalId);
          setError(
            error instanceof Error ? error.message : "Failed to create annotation",
          );
        });
    };

    const handleUpdate = (updated: unknown) => {
      const ann = updated as unknown as ApiAnnotation;
      if (!ann.id) return;
      const pending = pendingCreates.get(ann.id);

      if (pending && !pending.savedId) {
        // Coalesce all pre-create edits. Only the last geometry needs to be
        // persisted once the backend has assigned an ID.
        pending.latestTarget = ann.target;
        pending.hasGeometryUpdate = true;
        setError(null);
        return;
      }

      // A delayed event can still carry the temporary ID after replacement.
      // Route it through the alias to the backend ID.
      persistGeometryUpdate(pending?.savedId ?? ann.id, ann.target);
    };

    const handleDelete = (annotation: unknown) => {
      const ann = annotation as unknown as ApiAnnotation;
      if (!ann.id) return;
      const annotationId = ann.id;
      setError(null);

      const pending = pendingCreates.get(annotationId);
      if (pending && !pending.savedId) {
        pending.cancelled = true;
        setSelected(null);
        return;
      }

      void enqueueAnnotationMutation(file, annotationId, async () => {
        if (!active) return;
        const current = useAnnotationStore
          .getState()
          .annotations.find((item) => item.id === annotationId);
        if (!current) return;

        try {
          await api.deleteAnnotation(file, annotationId, {
            revision: current.revision,
          });
          if (!active) return;
          removeAnnotation(annotationId);
          annoIdsRef.current.delete(annotationId);
        } catch (error) {
          if (!active) return;

          if (error instanceof ApiError && error.status === 409) {
            try {
              const latest = await api.getAnnotation(file, annotationId);
              if (!active) return;
              updateAnnotation(annotationId, latest);
              replaceVisualAnnotation(latest);
              setError(
                "This annotation changed elsewhere. The latest version was restored.",
              );
            } catch (refreshError) {
              if (!active) return;
              if (
                refreshError instanceof ApiError &&
                refreshError.status === 404
              ) {
                removeAnnotation(annotationId);
                annoIdsRef.current.delete(annotationId);
                setError("This annotation was already deleted elsewhere.");
              } else {
                replaceVisualAnnotation(current);
                setError(
                  refreshError instanceof Error
                    ? `The annotation changed elsewhere, but the latest version could not be loaded: ${refreshError.message}`
                    : "Failed to refresh the latest annotation",
                );
              }
            }
            return;
          }

          if (error instanceof ApiError && error.status === 404) {
            removeAnnotation(annotationId);
            annoIdsRef.current.delete(annotationId);
            setError("This annotation was already deleted elsewhere.");
            return;
          }

          replaceVisualAnnotation(current);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to delete annotation",
          );
        }
      }).catch((error: unknown) => {
        if (active) {
          try {
            replaceVisualAnnotation(ann);
          } catch {
            // Visual restoration is best-effort.
          }
          setError(
            error instanceof Error
              ? error.message
              : "Failed to delete annotation",
          );
        }
      });
    };

    const handleSelectionChanged = (annotations: unknown[]) => {
      if (annotations.length > 0) {
        const first = annotations[0] as unknown as ApiAnnotation;
        setSelected(first.id);
      } else {
        setSelected(null);
      }
    };

    anno.on("createAnnotation", handleCreate);
    anno.on("updateAnnotation", handleUpdate);
    anno.on("deleteAnnotation", handleDelete);
    anno.on("selectionChanged", handleSelectionChanged);

    return () => {
      active = false;
      pendingCreates.clear();
      anno.off("createAnnotation", handleCreate);
      anno.off("updateAnnotation", handleUpdate);
      anno.off("deleteAnnotation", handleDelete);
      anno.off("selectionChanged", handleSelectionChanged);
    };
  }, [
    anno,
    file,
    addAnnotation,
    removeAnnotation,
    removeVisualAnnotation,
    updateAnnotation,
    replaceVisualAnnotation,
    setSelected,
    setError,
  ]);

  return null;
}
