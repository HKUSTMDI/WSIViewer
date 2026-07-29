"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Microscope } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";

const ViewerContent = dynamic(() => import("@/components/viewer/ViewerContent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <Skeleton className="h-[80vh] w-[80vw] rounded-lg" />
    </div>
  ),
});

function ViewerInner() {
  const searchParams = useSearchParams();
  const file = searchParams.get("file");

  if (!file) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>No file specified.</p>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to slides
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Microscope className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{file}</span>
        </div>
      </header>

      {/* Viewer */}
      <ViewerContent file={file} />
    </div>
  );
}

export default function ViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Skeleton className="h-[80vh] w-[80vw] rounded-lg" />
        </div>
      }
    >
      <ViewerInner />
    </Suspense>
  );
}
