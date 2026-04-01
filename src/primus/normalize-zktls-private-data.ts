/**
 * Brevis / Gateway expect `zkTlsProof.private_data` as
 * `{ id: string; salt: string; content: unknown[] }[]`.
 * Primus `getPrivateData` may return a flat record: each logical field `foo` has `foo` (salt/commit)
 * and `foo_plain` (JSON string of an array payload).
 */
export interface NormalizedZkTlsPrivateDatum {
  id: string;
  salt: string;
  content: unknown[];
}

const PLAIN_KEY_SUFFIX = "_plain";

function isNormalizedPrivateDataArray(raw: unknown): raw is NormalizedZkTlsPrivateDatum[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return Array.isArray(raw);
  }
  return raw.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as NormalizedZkTlsPrivateDatum).id === "string" &&
      typeof (item as NormalizedZkTlsPrivateDatum).salt === "string" &&
      Array.isArray((item as NormalizedZkTlsPrivateDatum).content)
  );
}

function parsePlainToContent(plainVal: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(plainVal);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch {
    return [plainVal];
  }
}

/**
 * Converts flat `{ saltKey, saltKey_plain }` records into normalized entries.
 * If `raw` is already a normalized array (or empty array), returns it unchanged.
 * If `raw` is a non-object or an object with no usable `*_plain` pairs, returns `raw` as-is.
 */
export function normalizeZkTlsPrivateDataForGateway(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return raw;
  }
  if (isNormalizedPrivateDataArray(raw)) {
    return raw;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  const byId = new Map<string, NormalizedZkTlsPrivateDatum>();

  for (const key of Object.keys(obj)) {
    if (!key.endsWith(PLAIN_KEY_SUFFIX)) {
      continue;
    }
    const id = key.slice(0, -PLAIN_KEY_SUFFIX.length);
    if (id.length === 0) {
      continue;
    }
    const saltVal = obj[id];
    if (typeof saltVal !== "string") {
      continue;
    }
    const plainVal = obj[key];
    if (typeof plainVal !== "string") {
      continue;
    }
    byId.set(id, {
      id,
      salt: saltVal,
      content: parsePlainToContent(plainVal)
    });
  }

  if (byId.size === 0) {
    return raw;
  }

  return [...byId.keys()].sort((a, b) => a.localeCompare(b)).map((id) => byId.get(id)!);
}
