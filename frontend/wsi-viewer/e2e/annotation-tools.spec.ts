import { expect, test, type Page } from "@playwright/test";

interface StoredAnnotation {
  id: string;
  type: string;
  body: unknown[];
  target: { selector: Record<string, unknown> };
  created: string;
  modified: string;
  revision: number;
}

interface AnnotationUpdateRequest {
  body?: unknown[];
  target?: StoredAnnotation["target"];
  revision?: number;
}

interface AnnotationDeleteRequest {
  annotationId: string;
  revision?: number;
}

async function mockViewerApi(page: Page) {
  let annotations: StoredAnnotation[] = [];
  const batchRequests: unknown[] = [];
  const updateRequests: AnnotationUpdateRequest[] = [];
  const deleteRequests: AnnotationDeleteRequest[] = [];

  await page.route("**/api/dzi/**", async (route) => {
    if (route.request().url().includes("_files/")) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ddd"/></svg>',
      });
      return;
    }
    await route.fulfill({
      contentType: "text/xml",
      body: '<Image TileSize="256" Overlap="0" Format="jpeg" xmlns="http://schemas.microsoft.com/deepzoom/2008"><Size Width="512" Height="512"/></Image>',
    });
  });

  await page.route("**/api/mpp/fixture.svs", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ mpp_x: 0.5, mpp_y: 0.5, objective_power: 40 }),
    }),
  );

  await page.route("**/api/annotations/fixture.svs/*", async (route) => {
    const request = route.request();
    const annotationId = decodeURIComponent(
      new URL(request.url()).pathname.split("/").at(-1) ?? "",
    );
    const current = annotations.find((item) => item.id === annotationId);

    if (request.method() === "GET") {
      await route.fulfill({
        status: current ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(
          current ?? { detail: `Annotation not found: ${annotationId}` },
        ),
      });
      return;
    }

    if (request.method() === "PUT") {
      const payload = request.postDataJSON() as AnnotationUpdateRequest;
      updateRequests.push(payload);
      if (!current) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            detail: `Annotation not found: ${annotationId}`,
          }),
        });
        return;
      }
      if (payload.revision !== current.revision) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              annotation_id: annotationId,
              expected_revision: payload.revision,
              actual_revision: current.revision,
            },
          }),
        });
        return;
      }

      const next: StoredAnnotation = {
        ...current,
        body: payload.body ?? current.body,
        target: payload.target ?? current.target,
        revision: current.revision + 1,
        modified: `2026-07-16T00:0${current.revision}:00Z`,
      };
      annotations = annotations.map((item) =>
        item.id === annotationId ? next : item,
      );
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(next),
      });
      return;
    }

    if (request.method() === "DELETE") {
      const revisionValue = new URL(request.url()).searchParams.get("revision");
      const revision =
        revisionValue === null ? undefined : Number(revisionValue);
      deleteRequests.push({ annotationId, revision });

      if (!current) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            detail: `Annotation not found: ${annotationId}`,
          }),
        });
        return;
      }
      if (revision !== undefined && revision !== current.revision) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              annotation_id: annotationId,
              expected_revision: revision,
              actual_revision: current.revision,
            },
          }),
        });
        return;
      }

      annotations = annotations.filter((item) => item.id !== annotationId);
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/annotations/fixture.svs/batch", async (route) => {
    const payload = route.request().postDataJSON() as {
      operations: Array<{
        action: string;
        annotation_id: string;
        target?: StoredAnnotation["target"];
      }>;
    };
    batchRequests.push(payload);
    const updated: StoredAnnotation[] = [];
    const deleted: string[] = [];
    for (const operation of payload.operations) {
      if (operation.action === "delete") {
        annotations = annotations.filter((item) => item.id !== operation.annotation_id);
        deleted.push(operation.annotation_id);
      } else if (operation.action === "update" && operation.target) {
        const current = annotations.find((item) => item.id === operation.annotation_id)!;
        const next = {
          ...current,
          target: operation.target,
          revision: current.revision + 1,
          modified: "2026-07-16T00:01:00Z",
        };
        annotations = annotations.map((item) => item.id === next.id ? next : item);
        updated.push(next);
      }
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ created: [], updated, deleted }),
    });
  });

  await page.route("**/api/annotations/fixture.svs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(annotations),
      });
      return;
    }
    const request = route.request().postDataJSON() as Pick<StoredAnnotation, "body" | "target">;
    const saved: StoredAnnotation = {
      id: "freehand-1",
      type: "Annotation",
      body: request.body,
      target: request.target,
      created: "2026-07-16T00:00:00Z",
      modified: "2026-07-16T00:00:00Z",
      revision: 1,
    };
    annotations.push(saved);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(saved),
    });
  });

  return {
    getAnnotations: () => annotations,
    getBatchRequests: () => batchRequests,
    getUpdateRequests: () => updateRequests,
    getDeleteRequests: () => deleteRequests,
  };
}

async function drawFreehandAnnotation(page: Page) {
  await page.getByRole("button", { name: "Freehand (F)" }).click();
  const freehand = page.getByLabel("Freehand annotation canvas");
  await expect(freehand).toBeVisible();
  const box = await freehand.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;

  await page.mouse.move(centerX - 80, centerY - 80);
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY - 80, { steps: 8 });
  await page.mouse.move(centerX + 80, centerY + 80, { steps: 8 });
  await page.mouse.move(centerX - 80, centerY + 80, { steps: 8 });
  await page.mouse.up();

  return { centerX, centerY };
}

async function setAnnotationColor(page: Page, value: string) {
  const colorInput = page.getByLabel("Annotation color");
  await colorInput.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) throw new Error("Missing native input value setter");
    setter.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(colorInput).toHaveValue(value);
}

async function reloadAndWaitForViewerHydration(
  page: Page,
  annotationLabel: string,
) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Pan (V)" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(annotationLabel, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

test("freehand drawing and partial erasing survive a reload", async ({ page }) => {
  const state = await mockViewerApi(page);
  await page.goto("/viewer?file=fixture.svs");
  await expect(page.getByText("fixture.svs")).toBeVisible();

  const { centerX, centerY } = await drawFreehandAnnotation(page);

  await expect.poll(() => state.getAnnotations().length).toBe(1);
  expect(state.getAnnotations()[0].target.selector).toMatchObject({ type: "POLYGON" });

  await page.getByRole("button", { name: "Eraser (E)" }).click();
  const eraser = page.getByLabel("Annotation eraser canvas");
  await expect(eraser).toBeVisible();
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 5, centerY, { steps: 2 });
  await page.mouse.up();

  await expect.poll(() => state.getBatchRequests().length).toBe(1);
  expect(state.getAnnotations()[0].target.selector).toMatchObject({
    type: "MULTIPOLYGON",
  });

  await reloadAndWaitForViewerHydration(page, "Untitled");
  expect(state.getAnnotations()[0].revision).toBe(2);
});

test("annotation details persist across consecutive saves and export to GeoJSON", async ({
  page,
}) => {
  const state = await mockViewerApi(page);
  await page.goto("/viewer?file=fixture.svs");
  await expect(page.getByText("fixture.svs")).toBeVisible();

  await drawFreehandAnnotation(page);
  await expect.poll(() => state.getAnnotations().length).toBe(1);
  await page.getByText("Untitled", { exact: true }).click();

  const editor = page.getByRole("form", { name: "Edit annotation" });
  await expect(editor).toBeVisible();
  await page.getByLabel("Label").fill("Tumor region");
  await page.getByLabel("Notes").fill("Initial review");
  await setAnnotationColor(page, "#ff00aa");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => state.getAnnotations()[0]?.revision).toBe(2);
  await expect(page.getByText("Tumor region", { exact: true })).toBeVisible();
  expect(state.getUpdateRequests()).toHaveLength(1);
  expect(state.getUpdateRequests()[0]).toMatchObject({ revision: 1 });

  await page.getByLabel("Notes").fill("Confirmed after review");
  await setAnnotationColor(page, "#00aa55");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => state.getAnnotations()[0]?.revision).toBe(3);
  expect(state.getUpdateRequests()).toHaveLength(2);
  expect(state.getUpdateRequests().map((request) => request.revision)).toEqual([
    1,
    2,
  ]);

  await reloadAndWaitForViewerHydration(page, "Tumor region");
  await page.getByText("Tumor region", { exact: true }).click();
  await expect(page.getByRole("form", { name: "Edit annotation" })).toBeVisible();
  await expect(page.getByLabel("Label")).toHaveValue("Tumor region");
  await expect(page.getByLabel("Notes")).toHaveValue("Confirmed after review");
  await expect(page.getByLabel("Annotation color")).toHaveValue("#00aa55");
  expect(state.getAnnotations()[0].revision).toBe(3);

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export annotations as GeoJSON" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "fixture.svs.annotations.geojson",
  );

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    type: string;
    name: string;
    properties: Record<string, unknown>;
    features: Array<{
      id: string;
      geometry: { type: string; coordinates: number[][][] };
      properties: Record<string, unknown>;
    }>;
  };

  expect(exported).toMatchObject({
    type: "FeatureCollection",
    name: "fixture.svs",
    properties: {
      slide_id: "fixture.svs",
      coordinate_space: "image-pixel",
      axis_order: "x-right-y-down",
      origin: "top-left",
      units: "pixel",
      export_version: 1,
    },
  });
  expect(exported.features).toHaveLength(1);
  expect(exported.features[0]).toMatchObject({
    id: "freehand-1",
    geometry: { type: "Polygon" },
    properties: {
      annotation_id: "freehand-1",
      slide_id: "fixture.svs",
      label: "Tumor region",
      notes: "Confirmed after review",
      color: "#00aa55",
      selector_type: "POLYGON",
      revision: 3,
    },
  });
  const ring = exported.features[0].geometry.coordinates[0];
  expect(ring.length).toBeGreaterThanOrEqual(4);
  expect(ring[0]).toEqual(ring.at(-1));
});

test("Delete removes the selected annotation except while editing text", async ({
  page,
}) => {
  const state = await mockViewerApi(page);
  await page.goto("/viewer?file=fixture.svs");
  await expect(page.getByText("fixture.svs")).toBeVisible();

  await drawFreehandAnnotation(page);
  await expect.poll(() => state.getAnnotations().length).toBe(1);
  await page.getByText("Untitled", { exact: true }).click();

  const labelInput = page.getByLabel("Label");
  await labelInput.focus();
  await expect(labelInput).toBeFocused();
  await labelInput.press("Delete");

  expect(state.getDeleteRequests()).toHaveLength(0);
  expect(state.getAnnotations()).toHaveLength(1);

  const panButton = page.getByRole("button", { name: "Pan (V)" });
  await panButton.focus();
  await expect(panButton).toBeFocused();
  await page.keyboard.press("Delete");

  await expect.poll(() => state.getAnnotations().length).toBe(0);
  expect(state.getDeleteRequests()).toEqual([
    { annotationId: "freehand-1", revision: 1 },
  ]);
  await expect(
    page.getByText(
      "No annotations yet. Select a tool and draw on the slide.",
      { exact: true },
    ),
  ).toBeVisible();
});
