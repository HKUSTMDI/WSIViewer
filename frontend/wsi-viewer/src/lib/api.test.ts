import { afterEach, describe, expect, it, vi } from "vitest";
import { api, isAbortError } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("parses successful JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ filename: "slide.svs", size_bytes: 10 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api.listSlides()).resolves.toEqual([
      { filename: "slide.svs", size_bytes: 10 },
    ]);
  });

  it("throws a structured error for JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Annotation conflict" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const promise = api.getAnnotations("slide.svs");
    await expect(promise).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Annotation conflict",
    });
  });

  it("throws for a successful non-JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(api.getMpp("slide.svs")).rejects.toThrow(
      "Expected a JSON response",
    );
  });

  it("accepts a 204 delete and URL-encodes path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.deleteAnnotation("slide one.svs", "id/1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/annotations/slide%20one.svs/id%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("gets one annotation and URL-encodes both identifiers", async () => {
    const response = {
      id: "id/1",
      type: "Annotation",
      body: [],
      target: { selector: {} },
      created: "2026-07-29T00:00:00Z",
      modified: "2026-07-29T00:00:00Z",
      revision: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getAnnotation("slide one.svs", "id/1")).resolves.toEqual(
      response,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/annotations/slide%20one.svs/id%2F1",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("sends atomic batch operations as one request", async () => {
    const response = { created: [], updated: [], deleted: ["id-1"] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.applyAnnotationBatch("slide.svs", [
        { action: "delete", annotation_id: "id-1", revision: 2 },
      ]),
    ).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/annotations/slide.svs/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          operations: [{ action: "delete", annotation_id: "id-1", revision: 2 }],
        }),
      }),
    );
  });

  it("recognizes abort errors without relying on a browser DOMException", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new Error("failed"))).toBe(false);
  });
});
