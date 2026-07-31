"use client";

import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import { getAnnotationLabel } from "@/features/annotation/body";

interface AnnotationListProps {
  onDelete?: (id: string) => void;
}

export default function AnnotationList({ onDelete }: AnnotationListProps) {
  const annotations = useAnnotationStore((s) => s.annotations);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const annoActions = useViewerStore((s) => s.annoActions);

  const handleSelect = useCallback(
    (id: string) => {
      // Annotorious owns visual selection. Its selectionChanged event is the
      // single source that updates selectedId in the annotation store.
      annoActions?.select(id);
    },
    [annoActions]
  );

  if (annotations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No annotations yet. Select a tool and draw on the slide.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {annotations.map((ann, index) => {
          const label = getAnnotationLabel(ann.body);
          const selected = selectedId === ann.id;
          return (
            <div
              key={ann.id}
              className={`group flex items-center rounded-md text-sm transition-colors hover:bg-accent focus-within:bg-accent ${
                selected ? "bg-accent" : ""
              }`}
            >
              <button
                type="button"
                aria-label={`Select annotation ${index + 1}: ${label}`}
                aria-pressed={selected}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handleSelect(ann.id)}
              >
                <Badge variant="outline" className="shrink-0 text-xs">
                  {index + 1}
                </Badge>
                <span className="truncate">{label}</span>
              </button>
              <Button
                type="button"
                aria-label={`Delete annotation ${index + 1}`}
                variant="ghost"
                size="icon"
                className="mr-2 h-6 w-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                onClick={() => onDelete?.(ann.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
