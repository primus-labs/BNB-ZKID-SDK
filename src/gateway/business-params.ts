function coercedFiniteNumber(item: unknown): number | null {
  if (typeof item === "number" && Number.isFinite(item)) {
    return item;
  }
  if (typeof item === "string" && item.trim() !== "") {
    const n = Number(item);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Brevis may prefix threshold arrays with human-readable labels, e.g. `["GitHub", 21, 51]`.
 * Entries before the first numeric value must be strings; every entry from that index onward must
 * coerce to a finite number.
 */
function provingNumbersFromBusinessParamArray(value: unknown[]): number[] | undefined {
  const firstNumIdx = value.findIndex((item) => coercedFiniteNumber(item) !== null);
  if (firstNumIdx === -1) {
    return undefined;
  }
  for (let i = 0; i < firstNumIdx; i++) {
    if (typeof value[i] !== "string") {
      return undefined;
    }
  }
  const nums: number[] = [];
  for (let i = firstNumIdx; i < value.length; i++) {
    const n = coercedFiniteNumber(value[i]);
    if (n === null) {
      return undefined;
    }
    nums.push(n);
  }
  return nums;
}

export function isBusinessParamsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-clones a Gateway `businessParams`-shaped object for `prove.provingParams.businessParams` / POST body.
 * Returns `undefined` for missing or non-object input.
 */
export function cloneGatewayBusinessParamsForRequest(raw: unknown): Record<string, unknown> | undefined {
  if (!isBusinessParamsObject(raw)) {
    return undefined;
  }
  try {
    return structuredClone(raw) as Record<string, unknown>;
  } catch {
    return { ...raw };
  }
}

/**
 * Optional helper: normalize config `businessParams` entries that are numeric threshold arrays
 * (with optional Brevis-style leading string labels). The prove workflow does **not** use this;
 * it passes `businessParams` through unchanged.
 */
export function businessParamsToProvingParams(raw: unknown): Record<string, number[]> | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const out: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const nums = provingNumbersFromBusinessParamArray(value);
    if (nums === undefined) {
      return undefined;
    }
    out[key] = nums;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
