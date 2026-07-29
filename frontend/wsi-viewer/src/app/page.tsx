"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, isAbortError } from "@/lib/api";
import type { SlideInfo } from "@/types/viewer";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Microscope, FileImage } from "lucide-react";

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function HomePage() {
  const [slides, setSlides] = useState<SlideInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listSlides({ signal: controller.signal })
      .then(setSlides)
      .catch((reason: unknown) => {
        if (isAbortError(reason)) return;
        setSlides([]);
        setError(reason instanceof Error ? reason.message : "Failed to load slides");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Microscope className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">WSIViewer</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="mb-6 text-lg font-medium text-muted-foreground">
          Available Slides
        </h2>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : slides.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <FileImage className="mx-auto mb-3 h-10 w-10" />
            <p>No slides found.</p>
            <p className="mt-1 text-sm">
              Place WSI files in the <code>images/</code> directory.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {slides.map((slide) => (
              <Link
                key={slide.filename}
                href={`/viewer?file=${encodeURIComponent(slide.filename)}`}
                className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <FileImage className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{slide.filename}</span>
                </div>
                <Badge variant="secondary">{formatSize(slide.size_bytes)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
