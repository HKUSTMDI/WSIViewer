import { describe, expect, it } from "vitest";
import {
  API_BASE,
  APP_BASE_PATH,
  appPath,
  joinBasePath,
  normalizeBasePath,
  resolveApiBase,
} from "./deployment";

describe("deployment paths", () => {
  it("keeps the default root deployment backward compatible", () => {
    expect(APP_BASE_PATH).toBe("");
    expect(API_BASE).toBe("/api");
    expect(appPath("/osd-icons/")).toBe("/osd-icons/");
  });

  it.each([
    [undefined, ""],
    ["", ""],
    ["   ", ""],
    ["/", ""],
    ["openmetal-wsiviewer", "/openmetal-wsiviewer"],
    ["/openmetal-wsiviewer", "/openmetal-wsiviewer"],
    [" /openmetal-wsiviewer/ ", "/openmetal-wsiviewer"],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeBasePath(value)).toBe(expected);
  });

  it.each(["/viewer?file=x", "/viewer#top"])(
    "rejects a base path containing URL suffixes: %s",
    (value) => {
      expect(() => normalizeBasePath(value)).toThrow(
        "without a query or hash",
      );
    },
  );

  it("joins root and subpath deployments", () => {
    expect(joinBasePath("", "/api")).toBe("/api");
    expect(joinBasePath("/openmetal-wsiviewer", "/api")).toBe(
      "/openmetal-wsiviewer/api",
    );
    expect(() => joinBasePath("/openmetal-wsiviewer", "api")).toThrow(
      "must start with /",
    );
  });

  it("uses an explicit API base after trimming its trailing slash", () => {
    expect(
      resolveApiBase(" https://api.example.test/wsi/ ", "/ignored"),
    ).toBe("https://api.example.test/wsi");
  });

  it("derives the API base from the application base path", () => {
    expect(resolveApiBase(undefined, "")).toBe("/api");
    expect(resolveApiBase("", "/openmetal-wsiviewer")).toBe(
      "/openmetal-wsiviewer/api",
    );
  });
});
