import type { Point } from "./types";

export interface RectLike {
  left: number;
  top: number;
}

export function clientToLocalPoint(
  clientX: number,
  clientY: number,
  rect: RectLike,
): Point | null {
  if (![clientX, clientY, rect.left, rect.top].every(Number.isFinite)) return null;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function imagePixelsPerScreenPixel(
  viewportWidth: number,
  imageWidth: number,
  containerWidth: number,
): number | null {
  if (
    ![viewportWidth, imageWidth, containerWidth].every(Number.isFinite) ||
    viewportWidth <= 0 ||
    imageWidth <= 0 ||
    containerWidth <= 0
  ) {
    return null;
  }
  return (viewportWidth * imageWidth) / containerWidth;
}
