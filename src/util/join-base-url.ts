/**
 * Join an absolute pathname (e.g. `/v1/config`) onto `baseUrl` without dropping the base path.
 * `new URL("/v1/config", "http://host/prefix/")` incorrectly becomes `http://host/v1/config`.
 */
export function joinBaseUrlAndPath(baseUrl: string, pathname: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const relativePath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(relativePath, normalizedBase);
}
