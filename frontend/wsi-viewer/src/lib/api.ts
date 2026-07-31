import type { SlideInfo, MppInfo } from "@/types/viewer";
import type {
  Annotation,
  AnnotationBatchResponse,
  AnnotationCreate,
  AnnotationMutation,
  AnnotationUpdate,
} from "@/types/annotation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface VersionedRequestOptions extends RequestOptions {
  revision?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail != null) return JSON.stringify(detail);
  }
  return fallback;
}

export function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError",
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const hasJson = contentType.includes("application/json");
  let payload: unknown;

  if (response.status !== 204) {
    if (hasJson) {
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
    } else {
      payload = await response.text();
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(payload, `Request failed with status ${response.status}`),
      payload,
    );
  }

  if (response.status === 204) return undefined as T;
  if (!hasJson) {
    throw new ApiError(response.status, "Expected a JSON response", payload);
  }
  return payload as T;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export const api = {
  listSlides: ({ signal }: RequestOptions = {}): Promise<SlideInfo[]> =>
    requestJson<SlideInfo[]>("/slides", { signal }),

  getDziUrl: (file: string) => `${API_BASE}/dzi/${segment(file)}`,

  getThumbnailUrl: (file: string, width = 200, height = 200) =>
    `${API_BASE}/thumbnail/${segment(file)}?width=${width}&height=${height}`,

  getProperties: (
    file: string,
    { signal }: RequestOptions = {},
  ): Promise<Record<string, string>> =>
    requestJson<Record<string, string>>(`/properties/${segment(file)}`, {
      signal,
    }),

  getMpp: (
    file: string,
    { signal }: RequestOptions = {},
  ): Promise<MppInfo> => requestJson<MppInfo>(`/mpp/${segment(file)}`, { signal }),

  getAnnotations: (
    slideId: string,
    { signal }: RequestOptions = {},
  ): Promise<Annotation[]> =>
    requestJson<Annotation[]>(`/annotations/${segment(slideId)}`, { signal }),

  getAnnotation: (
    slideId: string,
    annId: string,
    { signal }: RequestOptions = {},
  ): Promise<Annotation> =>
    requestJson<Annotation>(
      `/annotations/${segment(slideId)}/${segment(annId)}`,
      { signal },
    ),

  createAnnotation: (
    slideId: string,
    data: AnnotationCreate,
    { signal }: RequestOptions = {},
  ): Promise<Annotation> =>
    requestJson<Annotation>(`/annotations/${segment(slideId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    }),

  updateAnnotation: (
    slideId: string,
    annId: string,
    data: AnnotationUpdate,
    { signal }: RequestOptions = {},
  ): Promise<Annotation> =>
    requestJson<Annotation>(
      `/annotations/${segment(slideId)}/${segment(annId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal,
      },
    ),

  deleteAnnotation: (
    slideId: string,
    annId: string,
    { signal, revision }: VersionedRequestOptions = {},
  ): Promise<void> => {
    const query = revision == null ? "" : `?revision=${revision}`;
    return requestJson<void>(`/annotations/${segment(slideId)}/${segment(annId)}${query}`, {
      method: "DELETE",
      signal,
    });
  },

  applyAnnotationBatch: (
    slideId: string,
    operations: AnnotationMutation[],
    { signal }: RequestOptions = {},
  ): Promise<AnnotationBatchResponse> =>
    requestJson<AnnotationBatchResponse>(`/annotations/${segment(slideId)}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations }),
      signal,
    }),
};
