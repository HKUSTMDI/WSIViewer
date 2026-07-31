import type { MppInfo } from "@/types/viewer";

/**
 * Convert pixel distance to real-world distance string.
 */
export function pixelsToDistance(
  pixels: number,
  mpp: MppInfo | null
): string {
  if (!mpp?.mpp_x) return `${pixels.toFixed(0)} px`;

  const microns = pixels * mpp.mpp_x;
  if (microns >= 1000) {
    return `${(microns / 1000).toFixed(2)} mm`;
  }
  return `${microns.toFixed(1)} μm`;
}

/** Convert a two-dimensional image displacement using independent X/Y MPP. */
export function pointsToDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  mpp: MppInfo | null,
): string {
  if (!mpp?.mpp_x || !mpp.mpp_y) return `${distance(p1, p2).toFixed(0)} px`;
  const microns = Math.hypot(
    (p2.x - p1.x) * mpp.mpp_x,
    (p2.y - p1.y) * mpp.mpp_y,
  );
  if (microns >= 1000) return `${(microns / 1000).toFixed(2)} mm`;
  return `${microns.toFixed(1)} μm`;
}

/**
 * Calculate distance between two points in image pixels.
 */
export function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Calculate angle between three points (vertex at p2) in degrees.
 */
export function angleDeg(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  mpp: MppInfo | null = null,
): number {
  const scaleX = mpp?.mpp_x && mpp.mpp_y ? mpp.mpp_x : 1;
  const scaleY = mpp?.mpp_x && mpp.mpp_y ? mpp.mpp_y : 1;
  const v1 = {
    x: (p1.x - p2.x) * scaleX,
    y: (p1.y - p2.y) * scaleY,
  };
  const v2 = {
    x: (p3.x - p2.x) * scaleX,
    y: (p3.y - p2.y) * scaleY,
  };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  const angle = Math.atan2(Math.abs(cross), dot);
  return (angle * 180) / Math.PI;
}
