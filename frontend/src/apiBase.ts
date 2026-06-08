export function resolveApiBase(configuredBase: string | null | undefined, isProduction: boolean): string {
  const normalized = (configuredBase ?? "").trim().replace(/\/+$/, "")
  if (normalized) return normalized
  return isProduction ? "" : "http://localhost:8000"
}
