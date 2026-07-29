import { create } from "zustand";
import type { Annotation } from "@/types/annotation";

interface AnnotationState {
  annotations: Annotation[];
  selectedId: string | null;

  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  setSelected: (id: string | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  selectedId: null,

  setAnnotations: (annotations) =>
    set((s) => ({
      annotations,
      selectedId:
        s.selectedId && annotations.some((a) => a.id === s.selectedId)
          ? s.selectedId
          : null,
    })),
  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),
  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  setSelected: (id) => set({ selectedId: id }),
}));
