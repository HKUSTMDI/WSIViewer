import { describe, expect, it, vi } from "vitest";
import {
  enqueueAnnotationBatchMutation,
  enqueueAnnotationMutation,
} from "./mutationQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("annotation mutation queue", () => {
  it("serializes mutations for the same slide and annotation", async () => {
    const first = deferred<number>();
    const firstOperation = vi.fn(() => first.promise);
    const secondOperation = vi.fn(async () => 2);

    const firstResult = enqueueAnnotationMutation(
      "slide",
      "annotation",
      firstOperation,
    );
    const secondResult = enqueueAnnotationMutation(
      "slide",
      "annotation",
      secondOperation,
    );
    await Promise.resolve();

    expect(firstOperation).toHaveBeenCalledOnce();
    expect(secondOperation).not.toHaveBeenCalled();

    first.resolve(1);
    await expect(firstResult).resolves.toBe(1);
    await expect(secondResult).resolves.toBe(2);
    expect(secondOperation).toHaveBeenCalledOnce();
  });

  it("allows different annotations to mutate in parallel", async () => {
    const first = deferred<void>();
    const secondOperation = vi.fn(async () => undefined);

    const firstResult = enqueueAnnotationMutation(
      "slide",
      "first",
      () => first.promise,
    );
    const secondResult = enqueueAnnotationMutation(
      "slide",
      "second",
      secondOperation,
    );
    await Promise.resolve();

    expect(secondOperation).toHaveBeenCalledOnce();
    first.resolve();
    await Promise.all([firstResult, secondResult]);
  });

  it("continues after a rejected mutation", async () => {
    const failure = new Error("failed");
    const first = deferred<void>();
    const nextOperation = vi.fn(async () => "saved");
    const firstResult = enqueueAnnotationMutation(
      "slide",
      "annotation",
      () => first.promise,
    );
    const nextResult = enqueueAnnotationMutation(
      "slide",
      "annotation",
      nextOperation,
    );

    first.reject(failure);
    await expect(firstResult).rejects.toBe(failure);
    await expect(nextResult).resolves.toBe("saved");
    expect(nextOperation).toHaveBeenCalledOnce();
  });

  it("orders a multi-annotation batch with mutations on every member", async () => {
    const first = deferred<void>();
    const batchOperation = vi.fn(async () => "batch");
    const afterBatch = vi.fn(async () => "after");
    const firstResult = enqueueAnnotationMutation(
      "slide",
      "first",
      () => first.promise,
    );
    const batchResult = enqueueAnnotationBatchMutation(
      "slide",
      ["second", "first", "first"],
      batchOperation,
    );
    const afterResult = enqueueAnnotationMutation(
      "slide",
      "second",
      afterBatch,
    );
    await Promise.resolve();

    expect(batchOperation).not.toHaveBeenCalled();
    expect(afterBatch).not.toHaveBeenCalled();

    first.resolve();
    await expect(firstResult).resolves.toBeUndefined();
    await expect(batchResult).resolves.toBe("batch");
    await expect(afterResult).resolves.toBe("after");
  });

  it("runs an empty batch immediately", async () => {
    await expect(
      enqueueAnnotationBatchMutation("slide", [], async () => "empty"),
    ).resolves.toBe("empty");
  });
});
