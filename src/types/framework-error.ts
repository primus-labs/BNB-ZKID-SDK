/**
 * Deterministic Framework error `category` on Gateway proof-requests `error` bodies
 * (BNB ZK ID Framework spec).
 *
 * The server may introduce new categories; callers should tolerate unknown strings via
 * {@link BnbZkIdFrameworkError.category}.
 */
export type BnbZkIdFrameworkErrorCategory =
  | "binding_conflict"
  | "internal_error"
  | "policy_rejected"
  | "schema_invalid"
  | "zktls_invalid";

/**
 * Framework `error` object on `POST/GET /v1/proof-requests` responses.
 *
 * Aligns with the Framework contract: stable `code`, deterministic optional `category`,
 * human `detail` (and optional `message` on some gateways).
 *
 * When {@link import("../errors/prove-error.js").BnbZkIdProveError} has `proveCode` `00002`, a Gateway
 * Framework failure often nests the same fields under `details.brevis` (workflow may set a single
 * human-readable `message` from `detail ?? message` for display).
 *
 * This is **not** the shape of Primus / zktls-js-sdk failures (`details.primus` carries
 * zkTLS SDK attestation `code` / `message`, a different namespace from Framework `category` / `code`).
 */
export interface BnbZkIdFrameworkError {
  category?: BnbZkIdFrameworkErrorCategory | string;
  /** Stable machine-readable code (e.g. `VALIDATOR_UNAVAILABLE`, `VERSION_UNSUPPORTED`). */
  code: string;
  /** Human-readable detail for diagnostics (Framework). */
  detail?: string;
  /** Some responses use `message`; treat as alternate human summary when `detail` is absent. */
  message?: string;
  /** Optional nested diagnostic bag from the gateway. */
  details?: Record<string, unknown>;
}
