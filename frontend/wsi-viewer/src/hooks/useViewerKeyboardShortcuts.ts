"use client";

import { useEffect } from "react";
import type { ActiveTool } from "@/types/viewer";

const SHORTCUT_MAP: Record<string, ActiveTool> = {
  v: "pan",
  r: "rectangle",
  c: "circle",
  p: "polygon",
  f: "freehand",
  e: "eraser",
  m: "measure-length",
  a: "measure-angle",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/**
 * Handles viewer shortcuts before OpenSeadragon's element-level key handler.
 * This prevents keys such as R, F and A from rotating, flipping or panning the
 * slide while they are being used to select application tools.
 */
export function useViewerKeyboardShortcuts(
  setActiveTool: (tool: ActiveTool) => void,
  onDeleteSelected?: () => void,
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        isEditableTarget(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        onDeleteSelected
      ) {
        event.preventDefault();
        event.stopPropagation();
        // Holding the key must not enqueue the same deletion repeatedly.
        if (!event.repeat) onDeleteSelected();
        return;
      }

      const tool = SHORTCUT_MAP[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        event.stopPropagation();
        setActiveTool(tool);
      } else if (event.key === "Escape") {
        // Keep Escape available to Annotorious so it can cancel an in-progress
        // drawing or selection while the application returns to Pan.
        setActiveTool("pan");
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onDeleteSelected, setActiveTool]);
}
