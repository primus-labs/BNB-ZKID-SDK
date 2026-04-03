/**
 * Proof-request status polling (`GET /v1/proof-requests/{id}`) after a successful create.
 * Tune these values for Gateway latency and product SLAs.
 */

/** Interval between polls while status is `initialized` | `generating` | `submitting`. */
export const PROOF_REQUEST_POLL_INTERVAL_MS = 3_000;

/** Stop polling and fail prove (`10003`, `details.brevis.code` `TIMEOUT`) after this duration from the first poll. */
export const PROOF_REQUEST_POLL_MAX_DURATION_MS = 10 * 60 * 1_000;
