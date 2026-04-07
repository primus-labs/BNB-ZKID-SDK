import type { BnbZkIdFrameworkError } from "../types/framework-error.js";

/** Mirrors Gateway Framework `error` in `details` (`category`, `code`, `message` / `detail`). */
export function flatDetailsFromFrameworkError(err: BnbZkIdFrameworkError): Record<string, unknown> {
  const text = err.detail ?? err.message ?? err.code;
  const out: Record<string, unknown> = {};
  if (err.category !== undefined) {
    out.category = err.category;
  }
  out.code = err.code;
  out.message = text;
  if (err.details !== undefined && Object.keys(err.details).length > 0) {
    out.rawDetails = err.details;
  }
  return out;
}
