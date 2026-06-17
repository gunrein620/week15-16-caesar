export const SESSION_COOKIE_NAME = "junglebob_session";

export function isSecureCookie(request?: Request): boolean {
  const configured = parseBooleanEnv(process.env.SESSION_COOKIE_SECURE);
  if (configured !== null) {
    return configured;
  }

  if (request) {
    return requestIsHttps(request);
  }

  return process.env.NODE_ENV === "production";
}

function requestIsHttps(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}
