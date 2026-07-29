"use client";

import { useEffect, useRef, useState } from "react";
import type OpenSeadragon from "openseadragon";
import { useViewerStore } from "@/stores/viewerStore";

interface ScaleBarProps {
  viewer: OpenSeadragon.Viewer | null;
}

const SCALE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
];

export default function ScaleBar({ viewer }: ScaleBarProps) {
  const mpp = useViewerStore((s) => s.mpp);
  const [barWidth, setBarWidth] = useState(0);
  const [label, setLabel] = useState("");
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer || !mpp?.mpp_x) return;

    const updateScaleBar = () => {
      const zoom = viewer.viewport.getZoom(true);
      const containerWidth = viewer.viewport.getContainerSize().x;
      const imageWidth =
        viewer.world.getItemAt(0)?.getContentSize().x ?? 1;

      // Pixels per viewport unit
      const viewportToPixels = containerWidth * zoom;
      // Image pixels shown per screen pixel
      const imagePixelsPerScreenPixel = imageWidth / viewportToPixels;
      // Microns per screen pixel
      const micronsPerScreenPixel = imagePixelsPerScreenPixel * mpp.mpp_x!;

      // Target ~120px wide bar
      const targetMicrons = micronsPerScreenPixel * 120;

      // Find nearest nice step
      let bestStep = SCALE_STEPS[0];
      for (const step of SCALE_STEPS) {
        if (step <= targetMicrons * 1.5) bestStep = step;
      }

      const pixelWidth = bestStep / micronsPerScreenPixel;
      setBarWidth(pixelWidth);

      if (bestStep >= 1000) {
        setLabel(`${bestStep / 1000} mm`);
      } else {
        setLabel(`${bestStep} μm`);
      }
    };

    const handler = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateScaleBar);
    };

    viewer.addHandler("animation", handler);
    viewer.addHandler("open", handler);
    // Initial update
    if (viewer.isOpen()) handler();

    return () => {
      viewer.removeHandler("animation", handler);
      viewer.removeHandler("open", handler);
      cancelAnimationFrame(rafRef.current);
    };
  }, [viewer, mpp]);

  if (!mpp?.mpp_x || barWidth <= 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start">
      <div
        className="h-1 rounded-sm bg-white shadow-md"
        style={{ width: `${barWidth}px` }}
      />
      <span className="mt-0.5 text-xs font-medium text-white drop-shadow-md">
        {label}
      </span>
    </div>
  );
}
