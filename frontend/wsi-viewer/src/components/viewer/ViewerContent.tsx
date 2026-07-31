"use client";

import {
  useState,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import type OpenSeadragon from "openseadragon";
import WSIViewer from "./WSIViewer";
import ViewerToolbar from "./ViewerToolbar";
import ScaleBar from "./ScaleBar";
import MeasureOverlay from "@/components/measurement/MeasureOverlay";
import FreehandOverlay from "@/components/annotation/FreehandOverlay";
import EraserOverlay from "@/components/annotation/EraserOverlay";
import ViewerSidebar from "@/components/layout/ViewerSidebar";
import { useViewerStore } from "@/stores/viewerStore";
import { useAnnotationStore } from "@/stores/annotationStore";
import { ApiError, api } from "@/lib/api";
import { useViewerNavigationPolicy } from "@/hooks/useViewerNavigationPolicy";
import { useViewerKeyboardShortcuts } from "@/hooks/useViewerKeyboardShortcuts";
import { downloadAnnotationsAsGeoJson } from "@/features/annotation/geojson";
import { enqueueAnnotationMutation } from "@/features/annotation/mutationQueue";
import type { AnnotationBody } from "@/types/annotation";

interface ViewerContentProps {
  file: string;
}

export default function ViewerContent({ file }: ViewerContentProps) {
  const [viewer, setViewer] = useState<OpenSeadragon.Viewer | null>(null);
  const pendingDeletesRef = useRef(new Set<string>());
  const setFile = useViewerStore((s) => s.setFile);
  const activeTool = useViewerStore((s) => s.activeTool);
  const setActiveTool = useViewerStore((s) => s.setActiveTool);
  const annoActions = useViewerStore((s) => s.annoActions);
  const error = useViewerStore((s) => s.error);
  const setError = useViewerStore((s) => s.setError);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const setAnnotations = useAnnotationStore((s) => s.setAnnotations);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation);

  useLayoutEffect(() => {
    setViewer(null);
    if (useViewerStore.getState().file !== file) {
      setAnnotations([]);
    }
    setFile(file);
  }, [file, setAnnotations, setFile]);

  useViewerNavigationPolicy(viewer, activeTool);

  const handleViewerReady = useCallback((v: OpenSeadragon.Viewer) => {
    setViewer(v);
  }, []);

  const handleDeleteAnnotation = useCallback(
    async (id: string) => {
      const pendingKey = JSON.stringify([file, id]);
      if (pendingDeletesRef.current.has(pendingKey)) return;
      pendingDeletesRef.current.add(pendingKey);
      setError(null);
      try {
        await enqueueAnnotationMutation(file, id, async () => {
          const annotation = useAnnotationStore
            .getState()
            .annotations.find((item) => item.id === id);
          if (!annotation) {
            annoActions?.cancelPendingCreate(id);
            return;
          }

          try {
            await api.deleteAnnotation(file, id, {
              revision: annotation.revision,
            });
            if (useViewerStore.getState().file !== file) return;
            removeAnnotation(id);
            annoActions?.removeVisual(id);
          } catch (err) {
            if (useViewerStore.getState().file !== file) return;

            if (err instanceof ApiError && err.status === 409) {
              try {
                const latest = await api.getAnnotation(file, id);
                if (useViewerStore.getState().file !== file) return;
                updateAnnotation(id, latest);
                annoActions?.update(latest);
                setError(
                  "This annotation changed elsewhere. The latest version was restored; delete it again to confirm.",
                );
              } catch (refreshError) {
                if (useViewerStore.getState().file !== file) return;
                if (
                  refreshError instanceof ApiError &&
                  refreshError.status === 404
                ) {
                  removeAnnotation(id);
                  annoActions?.removeVisual(id);
                  setError("This annotation was already deleted elsewhere.");
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

            if (err instanceof ApiError && err.status === 404) {
              removeAnnotation(id);
              annoActions?.removeVisual(id);
              setError("This annotation was already deleted elsewhere.");
              return;
            }

            console.error("Failed to delete annotation:", err);
            setError(
              err instanceof Error ? err.message : "Failed to delete annotation",
            );
          }
        });
      } finally {
        pendingDeletesRef.current.delete(pendingKey);
      }
    },
    [
      file,
      removeAnnotation,
      updateAnnotation,
      annoActions,
      setError,
    ],
  );

  const handleDeleteSelected = useCallback(() => {
    const currentSelectedId = useAnnotationStore.getState().selectedId;
    if (currentSelectedId) {
      void handleDeleteAnnotation(currentSelectedId);
    }
  }, [handleDeleteAnnotation]);

  useViewerKeyboardShortcuts(
    setActiveTool,
    selectedId ? handleDeleteSelected : undefined,
  );

  const handleUpdateAnnotation = useCallback(
    (id: string, body: AnnotationBody[]) =>
      enqueueAnnotationMutation(file, id, async () => {
        const current = useAnnotationStore
          .getState()
          .annotations.find((annotation) => annotation.id === id);
        if (!current) throw new Error("Annotation no longer exists");

        try {
          setError(null);
          const saved = await api.updateAnnotation(file, id, {
            body,
            revision: current.revision,
          });
          if (useViewerStore.getState().file !== file) return;
          updateAnnotation(id, saved);
          annoActions?.update(saved);
        } catch (error) {
          if (useViewerStore.getState().file !== file) return;

          if (error instanceof ApiError && error.status === 409) {
            try {
              const latest = await api.getAnnotation(file, id);
              if (useViewerStore.getState().file !== file) return;
              updateAnnotation(id, latest);
              annoActions?.update(latest);
              const conflict = new Error(
                "This annotation changed elsewhere. The latest version was loaded; review your edits and save again.",
              );
              setError(conflict.message);
              throw conflict;
            } catch (refreshError) {
              if (
                refreshError instanceof ApiError &&
                refreshError.status === 404
              ) {
                removeAnnotation(id);
                annoActions?.removeVisual(id);
                const missing = new Error(
                  "This annotation was deleted elsewhere.",
                );
                setError(missing.message);
                throw missing;
              }
              if (!(refreshError instanceof ApiError)) throw refreshError;

              const refreshFailure = new Error(
                `The annotation changed elsewhere, but the latest version could not be loaded: ${refreshError.message}`,
              );
              setError(refreshFailure.message);
              throw refreshFailure;
            }
          }

          if (error instanceof ApiError && error.status === 404) {
            removeAnnotation(id);
            annoActions?.removeVisual(id);
            const missing = new Error(
              "This annotation was deleted elsewhere.",
            );
            setError(missing.message);
            throw missing;
          }

          const message =
            error instanceof Error
              ? error.message
              : "Failed to update annotation";
          setError(message);
          throw error;
        }
      }),
    [
      file,
      updateAnnotation,
      removeAnnotation,
      annoActions,
      setError,
    ],
  );

  const handleExportGeoJson = useCallback(() => {
    try {
      setError(null);
      downloadAnnotationsAsGeoJson(
        useAnnotationStore.getState().annotations,
        file,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to export annotations",
      );
    }
  }, [file, setError]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main viewer area */}
      <div className="relative flex-1">
        <WSIViewer
          key={file}
          file={file}
          onViewerReady={handleViewerReady}
        />
        <ScaleBar viewer={viewer} />
        <MeasureOverlay key={`measure:${file}`} viewer={viewer} />
        <FreehandOverlay viewer={viewer} file={file} />
        <EraserOverlay viewer={viewer} file={file} />

        {error && (
          <div role="alert" className="absolute left-4 top-4 z-[60] max-w-md rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-sm text-destructive shadow-md">
            {error}
          </div>
        )}

        {/* Floating toolbar */}
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2">
          <ViewerToolbar />
        </div>
      </div>

      {/* Sidebar */}
      <ViewerSidebar
        onDeleteAnnotation={handleDeleteAnnotation}
        onUpdateAnnotation={handleUpdateAnnotation}
        onExportGeoJson={handleExportGeoJson}
      />
    </div>
  );
}
