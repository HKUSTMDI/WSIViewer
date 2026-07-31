function withoutTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";
  if (trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error("NEXT_PUBLIC_BASE_PATH must be a URL path without a query or hash");
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withoutTrailingSlashes(withLeadingSlash);
}

export function joinBasePath(basePath: string, path: string): string {
  if (!path.startsWith("/")) {
    throw new Error("Application paths must start with /");
  }
  return `${normalizeBasePath(basePath)}${path}`;
}

export function resolveApiBase(
  configuredApiBase: string | undefined,
  basePath: string,
): string {
  const configured = configuredApiBase?.trim();
  return configured
    ? withoutTrailingSlashes(configured)
    : joinBasePath(basePath, "/api");
}

export const APP_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_BASE_PATH,
);

export const API_BASE = resolveApiBase(
  process.env.NEXT_PUBLIC_API_BASE,
  APP_BASE_PATH,
);

export function appPath(path: string): string {
  return joinBasePath(APP_BASE_PATH, path);
}
