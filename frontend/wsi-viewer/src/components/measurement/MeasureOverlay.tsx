"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import OpenSeadragon from "openseadragon";
import { useViewerStore } from "@/stores/viewerStore";
import { angleDeg, pointsToDistance } from "@/lib/measurement";

interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  type: "length" | "angle";
  points: Point[]; // image coordinates
  label: string;
}

interface MeasureOverlayProps {
  viewer: OpenSeadragon.Viewer | null;
}

export default function MeasureOverlay({ viewer }: MeasureOverlayProps) {
  const activeTool = useViewerStore((s) => s.activeTool);
  const mpp = useViewerStore((s) => s.mpp);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const pendingPoints = useRef<Point[]>([]);
  const cursorPt = useRef<Point | null>(null); // live cursor in image coords
  const isMeasuring =
    activeTool === "measure-length" || activeTool === "measure-angle";

  /* ── coordinate helpers ────────────────────────────────────────── */

  const screenToImage = useCallback(
    (clientX: number, clientY: number): Point | null => {
      if (!viewer) return null;
      const rect = viewer.element.getBoundingClientRect();
      const pixel = new OpenSeadragon.Point(
        clientX - rect.left,
        clientY - rect.top,
      );
      const vp = viewer.viewport.pointFromPixel(pixel);
      const item = viewer.world.getItemAt(0);
      if (!item) return null;
      const img = item.viewportToImageCoordinates(vp);
      return { x: img.x, y: img.y };
    },
    [viewer],
  );

  const imageToCanvas = useCallback(
    (pt: Point): Point | null => {
      if (!viewer) return null;
      const item = viewer.world.getItemAt(0);
      if (!item) return null;
      const vpPt = item.imageToViewportCoordinates(
        new OpenSeadragon.Point(pt.x, pt.y),
      );
      const winPt = viewer.viewport.viewportToWindowCoordinates(vpPt);
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: winPt.x - rect.left, y: winPt.y - rect.top };
    },
    [viewer],
  );

  /* ── drawing ───────────────────────────────────────────────────── */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewer) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Build items: completed measurements + pending WIP
    const allItems: Measurement[] = [...measurements];

    // Add pending + cursor as a WIP item
    if (pendingPoints.current.length > 0) {
      const wipPts = [...pendingPoints.current];
      if (cursorPt.current) wipPts.push(cursorPt.current);
      allItems.push({
        id: "_pending",
        type:
          activeTool === "measure-angle" ? "angle" : "length",
        points: wipPts,
        label: "",
      });
    }

    for (const m of allItems) {
      const sPts = m.points
        .map(imageToCanvas)
        .filter((p): p is Point => p !== null);
      if (sPts.length === 0) continue;

      const isPending = m.id === "_pending";

      ctx.strokeStyle = "#ffcc00";
      ctx.lineWidth = 2;
      ctx.fillStyle = "#ffcc00";
      ctx.font = "bold 13px sans-serif";

      // Draw lines
      if (sPts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(sPts[0].x, sPts[0].y);

        // Solid lines between confirmed points
        const confirmedCount = isPending ? pendingPoints.current.length : sPts.length;
        for (let i = 1; i < confirmedCount && i < sPts.length; i++) {
          ctx.lineTo(sPts[i].x, sPts[i].y);
        }
        ctx.stroke();

        // Dashed line from last confirmed point to cursor
        if (isPending && cursorPt.current && confirmedCount < sPts.length) {
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = "rgba(255, 204, 0, 0.7)";
          ctx.beginPath();
          ctx.moveTo(sPts[confirmedCount - 1].x, sPts[confirmedCount - 1].y);
          ctx.lineTo(sPts[sPts.length - 1].x, sPts[sPts.length - 1].y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw points
      for (let i = 0; i < sPts.length; i++) {
        // Don't draw the cursor point as a filled dot
        if (isPending && cursorPt.current && i === sPts.length - 1) continue;
        ctx.beginPath();
        ctx.arc(sPts[i].x, sPts[i].y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw label
      if (m.label) {
        const labelPos =
          m.type === "angle" && sPts.length >= 3
            ? sPts[1]
            : {
                x: (sPts[0].x + sPts[sPts.length - 1].x) / 2,
                y: (sPts[0].y + sPts[sPts.length - 1].y) / 2,
              };

        ctx.fillStyle = "rgba(0,0,0,0.7)";
        const textWidth = ctx.measureText(m.label).width;
        ctx.fillRect(labelPos.x + 8, labelPos.y - 16, textWidth + 8, 20);
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(m.label, labelPos.x + 12, labelPos.y - 1);
      }

      // Draw angle arc
      if (m.type === "angle" && sPts.length === 3) {
        const [p1, p2, p3] = sPts;
        const angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        ctx.beginPath();
        ctx.arc(
          p2.x,
          p2.y,
          25,
          Math.min(angle1, angle2),
          Math.max(angle1, angle2),
        );
        ctx.strokeStyle = "rgba(255, 204, 0, 0.6)";
        ctx.stroke();
      }
    }
  }, [viewer, measurements, activeTool, imageToCanvas]);

  /* ── viewport redraw ───────────────────────────────────────────── */

  useEffect(() => {
    if (!viewer) return;
    const handler = () => requestAnimationFrame(draw);
    viewer.addHandler("animation", handler);
    viewer.addHandler("animation-finish", handler);
    viewer.addHandler("resize", handler);
    handler();
    return () => {
      viewer.removeHandler("animation", handler);
      viewer.removeHandler("animation-finish", handler);
      viewer.removeHandler("resize", handler);
    };
  }, [viewer, draw]);

  /* ── pointer handlers (DOM events on canvas) ───────────────────── */

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!viewer || !isMeasuring) return;
      const pt = screenToImage(e.clientX, e.clientY);
      if (!pt) return;

      pendingPoints.current = [...pendingPoints.current, pt];

      const neededPoints = activeTool === "measure-angle" ? 3 : 2;

      if (pendingPoints.current.length >= neededPoints) {
        const points = [...pendingPoints.current];
        let label: string;
        if (activeTool === "measure-angle") {
          label = `${angleDeg(points[0], points[1], points[2], mpp).toFixed(1)}°`;
        } else {
          label = pointsToDistance(points[0], points[1], mpp);
        }

        setMeasurements((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: activeTool === "measure-angle" ? "angle" : "length",
            points,
            label,
          },
        ]);
        pendingPoints.current = [];
        cursorPt.current = null;
      }

      requestAnimationFrame(draw);
    },
    [viewer, isMeasuring, activeTool, mpp, screenToImage, draw],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isMeasuring || pendingPoints.current.length === 0) return;
      cursorPt.current = screenToImage(e.clientX, e.clientY);
      requestAnimationFrame(draw);
    },
    [isMeasuring, screenToImage, draw],
  );

  /* ── clear pending on tool change ──────────────────────────────── */

  useEffect(() => {
    pendingPoints.current = [];
    cursorPt.current = null;
  }, [activeTool]);

  /* ── render ────────────────────────────────────────────────────── */

  return (
    <canvas
      ref={canvasRef}
      aria-label="Measurement canvas"
      className="absolute inset-0"
      style={{
        zIndex: 30,
        display: isMeasuring || measurements.length > 0 ? "block" : "none",
        pointerEvents: isMeasuring ? "auto" : "none",
        cursor: isMeasuring ? "crosshair" : "default",
        touchAction: "none",
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    />
  );
}
