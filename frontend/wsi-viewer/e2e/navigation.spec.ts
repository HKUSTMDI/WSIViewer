import { expect, test } from "@playwright/test";

test("lists slides and links to the viewer", async ({ page }) => {
  await page.route("**/api/slides", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { filename: "fixture.svs", size_bytes: 1024 },
      ]),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "WSIViewer" })).toBeVisible();
  await expect(page.getByRole("link", { name: /fixture\.svs/ })).toHaveAttribute(
    "href",
    "/viewer?file=fixture.svs",
  );
});

test("shows a useful message when no viewer file is specified", async ({ page }) => {
  await page.goto("/viewer");

  await expect(page.getByText("No file specified.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to slides/ })).toBeVisible();
});
