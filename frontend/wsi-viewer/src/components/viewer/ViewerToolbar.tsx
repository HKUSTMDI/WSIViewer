"use client";

import {
  Hand,
  Square,
  Circle,
  Pentagon,
  Pencil,
  Eraser,
  Ruler,
  TriangleRight,
  Eye,
  EyeOff,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { useViewerStore } from "@/stores/viewerStore";
import type { ActiveTool } from "@/types/viewer";

const annotationTools: { tool: ActiveTool; icon: React.ElementType; label: string; shortcut: string }[] = [
  { tool: "pan", icon: Hand, label: "Pan", shortcut: "V" },
  { tool: "rectangle", icon: Square, label: "Rectangle", shortcut: "R" },
  { tool: "circle", icon: Circle, label: "Circle", shortcut: "C" },
  { tool: "polygon", icon: Pentagon, label: "Polygon", shortcut: "P" },
  { tool: "freehand", icon: Pencil, label: "Freehand", shortcut: "F" },
  { tool: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
];

const measureTools: { tool: ActiveTool; icon: React.ElementType; label: string; shortcut: string }[] = [
  { tool: "measure-length", icon: Ruler, label: "Measure Length", shortcut: "M" },
  { tool: "measure-angle", icon: TriangleRight, label: "Measure Angle", shortcut: "A" },
];

interface ToolButtonProps {
  tool: ActiveTool;
  icon: React.ElementType;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ tool, icon: Icon, label, shortcut, active, onClick }: ToolButtonProps) {
  return (
    <Tooltip key={tool}>
      <TooltipTrigger
        render={
          <Button
            aria-label={`${label} (${shortcut})`}
            variant={active ? "default" : "ghost"}
            size="icon"
            onClick={onClick}
          />
        }
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} ({shortcut})
      </TooltipContent>
    </Tooltip>
  );
}

const ERASER_SIZES = [
  { label: "S", value: 20 },
  { label: "M", value: 40 },
  { label: "L", value: 80 },
];

export default function ViewerToolbar() {
  const activeTool = useViewerStore((s) => s.activeTool);
  const setActiveTool = useViewerStore((s) => s.setActiveTool);
  const showAnnotations = useViewerStore((s) => s.showAnnotations);
  const toggleAnnotations = useViewerStore((s) => s.toggleAnnotations);
  const sidebarOpen = useViewerStore((s) => s.sidebarOpen);
  const toggleSidebar = useViewerStore((s) => s.toggleSidebar);
  const eraserSize = useViewerStore((s) => s.eraserSize);
  const setEraserSize = useViewerStore((s) => s.setEraserSize);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
      {annotationTools.map((t) => (
        <ToolButton
          key={t.tool}
          {...t}
          active={activeTool === t.tool}
          onClick={() => setActiveTool(t.tool)}
        />
      ))}

      {/* Eraser size selector — shown when eraser is active */}
      {activeTool === "eraser" && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <div className="flex items-center gap-0.5">
            {ERASER_SIZES.map((s) => (
              <Button
                key={s.value}
                variant={eraserSize === s.value ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7 text-xs"
                onClick={() => setEraserSize(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </>
      )}

      <Separator orientation="vertical" className="mx-1 h-6" />

      {measureTools.map((t) => (
        <ToolButton
          key={t.tool}
          {...t}
          active={activeTool === t.tool}
          onClick={() => setActiveTool(t.tool)}
        />
      ))}

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Tooltip>
        <TooltipTrigger
          render={<Button aria-label="Toggle annotations" variant="ghost" size="icon" onClick={toggleAnnotations} />}
        >
          {showAnnotations ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {showAnnotations ? "Hide" : "Show"} Annotations
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={<Button aria-label="Toggle annotation sidebar" variant="ghost" size="icon" onClick={toggleSidebar} />}
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {sidebarOpen ? "Close" : "Open"} Sidebar
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
