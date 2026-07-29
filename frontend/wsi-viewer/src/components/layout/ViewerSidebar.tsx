"use client";

import { Download } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import AnnotationList from "@/components/annotation/AnnotationList";
import AnnotationEditor from "@/components/annotation/AnnotationEditor";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import type { AnnotationBody } from "@/types/annotation";

interface ViewerSidebarProps {
  onDeleteAnnotation?: (id: string) => void;
  onUpdateAnnotation: (id: string, body: AnnotationBody[]) => Promise<void>;
  onExportGeoJson: () => void;
}

export default function ViewerSidebar({
  onDeleteAnnotation,
  onUpdateAnnotation,
  onExportGeoJson,
}: ViewerSidebarProps) {
  const sidebarOpen = useViewerStore((s) => s.sidebarOpen);
  const annotations = useAnnotationStore((s) => s.annotations);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const selected = annotations.find((annotation) => annotation.id === selectedId);

  if (!sidebarOpen) return null;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h3 className="text-sm font-semibold">Annotations</h3>
        <Button
          aria-label="Export annotations as GeoJSON"
          variant="outline"
          size="sm"
          disabled={annotations.length === 0}
          onClick={onExportGeoJson}
        >
          <Download className="h-3.5 w-3.5" />
          GeoJSON
        </Button>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AnnotationList onDelete={onDeleteAnnotation} />
      </div>
      {selected && (
        <>
          <Separator />
          <div className="max-h-[48%] shrink-0 overflow-y-auto">
            <AnnotationEditor
              key={selected.id}
              annotation={selected}
              onSave={onUpdateAnnotation}
            />
          </div>
        </>
      )}
    </div>
  );
}
