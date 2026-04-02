/** Deep equality for JSON-like trees (plain objects, arrays, primitives, null). */
export function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return a === b;
  }
  if (typeof a !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) {
      return false;
    }
    for (let i = 0; i < aa.length; i++) {
      if (!jsonDeepEqual(aa[i], bb[i])) {
        return false;
      }
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keysA = Object.keys(ao).sort();
  const keysB = Object.keys(bo).sort();
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) {
      return false;
    }
  }
  for (const k of keysA) {
    if (!jsonDeepEqual(ao[k], bo[k])) {
      return false;
    }
  }
  return true;
}
