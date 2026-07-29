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
  savedId?: string;
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
      const result = parseW3CImageAnnotation(
        annotation as unknown as Parameters<
          typeof parseW3CImageAnnotation
        >[0],
        { strict: false, invertY: false },
      );
      if (!result.parsed) {
        throw result.error ?? new Error("Failed to parse annotation");
      }

      if (anno.state.store.getAnnotation(annotation.id)) {
        anno.state.store.updateAnnotation(result.parsed, Origin.REMOTE);
      } else {
        anno.state.store.addAnnotation(result.parsed, Origin.REMOTE);
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
          anno.addAnnotation(ann as Parameters<typeof anno.addAnnotation>[0]);
          const a = ann as { id?: string };
          if (a.id) annoIdsRef.current.add(a.id);
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
    });
    return () => setAnnoActions(null);
  }, [
    anno,
    removeVisualAnnotation,
    replaceVisualAnnotation,
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
        setAnnotations(anns);
        anno.setAnnotations(
          anns as unknown as Parameters<typeof anno.setAnnotations>[0],
          true,
        );
        annoIdsRef.current = new Set(
          (anno.getAnnotations() as Array<{ id?: string }>)
            .map((annotation) => annotation.id)
            .filter((id): id is string => Boolean(id)),
        );
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
          anno.addAnnotation(ann as unknown as Parameters<typeof anno.addAnnotation>[0]);
          annoIdsRef.current.add(ann.id);
        } catch (e) {
          console.error("Sync: failed to add annotation to Annotorious:", ann.id, e);
        }
      }
    }

    // Remove from Annotorious any IDs no longer in the store.
    // Apply cleanup as a REMOTE store change so no backend event is emitted.
    const storeIds = new Set(annotations.map((a) => a.id));
    for (const id of annoIdsRef.current) {
      if (!storeIds.has(id)) {
        removeVisualAnnotation(id);
      }
    }
  }, [anno, annotations, removeVisualAnnotation]);

  // Wire events
  useEffect(() => {
    if (!anno) return;
    let active = true;
    // Annotorious can emit geometry updates while the create request is still
    // waiting for the backend-assigned ID. Keep a slide-local alias so those
    // edits can be replayed against the saved ID instead of being discarded.
    const pendingCreates = new Map<string, PendingCreate>();

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
      };
      pendingCreates.set(originalId, pending);
      setError(null);
      void api
        .createAnnotation(file, {
          body: ann.body,
          target: ann.target,
        })
        .then((saved) => {
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
