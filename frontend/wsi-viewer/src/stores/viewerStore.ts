import { create } from "zustand";
import type { ActiveTool, MppInfo } from "@/types/viewer";

/** Annotorious operations exposed for use outside the Annotorious component tree */
interface AnnoActions {
  add: (ann: unknown) => void;
  remove: (id: string) => void;
  /** Apply a remote visual update without triggering annotation API events */
  update: (ann: unknown) => void;
  /** Remove from Annotorious visually without triggering deleteAnnotation event */
  removeVisual: (id: string) => void;
  select: (id: string | null) => void;
}

interface ViewerState {
  file: string | null;
  mpp: MppInfo | null;
  error: string | null;
  activeTool: ActiveTool;
  showAnnotations: boolean;
  sidebarOpen: boolean;
  annoActions: AnnoActions | null;
  eraserSize: number; // eraser diameter in screen pixels

  setFile: (file: string) => void;
  setMpp: (mpp: MppInfo | null) => void;
  setError: (error: string | null) => void;
  setActiveTool: (tool: ActiveTool) => void;
  toggleAnnotations: () => void;
  toggleSidebar: () => void;
  setAnnoActions: (actions: AnnoActions | null) => void;
  setEraserSize: (size: number) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  file: null,
  mpp: null,
  error: null,
  activeTool: "pan",
  showAnnotations: true,
  sidebarOpen: true,
  annoActions: null,
  eraserSize: 40,

  setFile: (file) => set({ file, mpp: null, error: null }),
  setMpp: (mpp) => set({ mpp }),
  setError: (error) => set({ error }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleAnnotations: () =>
    set((s) => ({ showAnnotations: !s.showAnnotations })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setAnnoActions: (annoActions) => set({ annoActions }),
  setEraserSize: (size) => set({ eraserSize: size }),
}));
