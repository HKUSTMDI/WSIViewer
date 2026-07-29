import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViewerKeyboardShortcuts } from "./useViewerKeyboardShortcuts";
import type { ActiveTool } from "@/types/viewer";

function dispatchKey(
  target: HTMLElement,
  key: string,
  modifiers: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useViewerKeyboardShortcuts", () => {
  it.each([
    ["v", "pan"],
    ["R", "rectangle"],
    ["c", "circle"],
    ["P", "polygon"],
    ["f", "freehand"],
    ["E", "eraser"],
    ["m", "measure-length"],
    ["A", "measure-angle"],
  ] satisfies Array<[string, ActiveTool]>)(
    "maps %s to %s before the event reaches OpenSeadragon",
    (key, expectedTool) => {
      const setActiveTool = vi.fn();
      const viewerTarget = document.createElement("div");
      const osdHandler = vi.fn();
      viewerTarget.addEventListener("keydown", osdHandler);
      document.body.appendChild(viewerTarget);
      renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

      const event = dispatchKey(viewerTarget, key);

      expect(setActiveTool).toHaveBeenCalledWith(expectedTool);
      expect(event.defaultPrevented).toBe(true);
      expect(osdHandler).not.toHaveBeenCalled();
    },
  );

  it.each([
    document.createElement("input"),
    document.createElement("textarea"),
    document.createElement("select"),
  ])("does not intercept shortcuts from editable form controls", (target) => {
    const setActiveTool = vi.fn();
    document.body.appendChild(target);
    renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

    const event = dispatchKey(target, "r");

    expect(setActiveTool).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["Delete", "Backspace"])(
    "deletes the selected annotation with %s before Annotorious handles it",
    (key) => {
      const setActiveTool = vi.fn();
      const deleteSelected = vi.fn();
      const viewerTarget = document.createElement("div");
      const annotoriousHandler = vi.fn();
      viewerTarget.addEventListener("keydown", annotoriousHandler);
      document.body.appendChild(viewerTarget);
      renderHook(() =>
        useViewerKeyboardShortcuts(setActiveTool, deleteSelected),
      );

      const event = dispatchKey(viewerTarget, key);

      expect(deleteSelected).toHaveBeenCalledOnce();
      expect(setActiveTool).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(annotoriousHandler).not.toHaveBeenCalled();
    },
  );

  it("does not delete a selected annotation while editing text", () => {
    const setActiveTool = vi.fn();
    const deleteSelected = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() =>
      useViewerKeyboardShortcuts(setActiveTool, deleteSelected),
    );

    const event = dispatchKey(input, "Delete");

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not intercept Delete when there is no selected annotation", () => {
    const setActiveTool = vi.fn();
    const target = document.createElement("div");
    document.body.appendChild(target);
    renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

    const event = dispatchKey(target, "Delete");

    expect(event.defaultPrevented).toBe(false);
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it("prevents repeated Delete events without enqueueing another deletion", () => {
    const setActiveTool = vi.fn();
    const deleteSelected = vi.fn();
    const target = document.createElement("div");
    document.body.appendChild(target);
    renderHook(() =>
      useViewerKeyboardShortcuts(setActiveTool, deleteSelected),
    );

    dispatchKey(target, "Delete");
    const repeated = dispatchKey(target, "Delete", { repeat: true });

    expect(deleteSelected).toHaveBeenCalledOnce();
    expect(repeated.defaultPrevented).toBe(true);
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("preserves modified Delete shortcuts", (modifier) => {
    const setActiveTool = vi.fn();
    const deleteSelected = vi.fn();
    const target = document.createElement("div");
    document.body.appendChild(target);
    renderHook(() =>
      useViewerKeyboardShortcuts(setActiveTool, deleteSelected),
    );

    const event = dispatchKey(target, "Delete", modifier);

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not intercept shortcuts from contenteditable descendants", () => {
    const setActiveTool = vi.fn();
    const editor = document.createElement("div");
    const child = document.createElement("span");
    editor.setAttribute("contenteditable", "true");
    editor.appendChild(child);
    document.body.appendChild(editor);
    renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

    const event = dispatchKey(child, "f");

    expect(setActiveTool).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("preserves modified browser and operating-system shortcuts", (modifier) => {
    const setActiveTool = vi.fn();
    const target = document.createElement("div");
    document.body.appendChild(target);
    renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

    const event = dispatchKey(target, "a", modifier);

    expect(setActiveTool).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("returns to Pan on Escape while allowing Annotorious to cancel its gesture", () => {
    const setActiveTool = vi.fn();
    const target = document.createElement("div");
    const annotoriousHandler = vi.fn();
    target.addEventListener("keydown", annotoriousHandler);
    document.body.appendChild(target);
    renderHook(() => useViewerKeyboardShortcuts(setActiveTool));

    const event = dispatchKey(target, "Escape");

    expect(setActiveTool).toHaveBeenCalledWith("pan");
    expect(event.defaultPrevented).toBe(false);
    expect(annotoriousHandler).toHaveBeenCalledOnce();
  });

  it("ignores unrelated keys and unregisters on unmount", () => {
    const setActiveTool = vi.fn();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const { unmount } = renderHook(() =>
      useViewerKeyboardShortcuts(setActiveTool),
    );

    dispatchKey(target, "x");
    unmount();
    dispatchKey(target, "r");

    expect(setActiveTool).not.toHaveBeenCalled();
  });
});
