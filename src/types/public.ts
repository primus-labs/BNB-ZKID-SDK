import type { BnbZkIdGatewayConfigProviderWire } from "./gateway-config-wire.js";

export type {
  BnbZkIdFrameworkError,
  BnbZkIdFrameworkErrorCategory
} from "./framework-error.js";
export type {
  BnbZkIdGatewayConfigPropertyWire,
  BnbZkIdGatewayConfigProviderWire
} from "./gateway-config-wire.js";

export interface BnbZkIdError {
  code: string;
  message: string;
  clientRequestId?: string;
  proofRequestId?: string;
}

/**
 * Gateway `businessParams` payload (`GET /v1/config` / `POST /v1/proof-requests`).
 * Opaque record; same keys/values as `properties[].businessParams` where applicable.
 */
export type BusinessParams = Record<string, unknown>;

/**
 * Carried on {@link ProveInput} as `provingParams`. **`businessParams`** is validated against
 * `GET /v1/config` when present and is used for the Gateway `POST /v1/proof-requests` body — it is
 * **not** copied into Primus `additionParams`.
 *
 * When **`jumpToUrl`** is a non-empty string, the SDK sets top-level Primus `additionParams.jumpToUrl`
 * for zkTLS runtimes that read it there.
 */
export interface ProvingParams {
  businessParams?: BusinessParams;
  jumpToUrl?: string;
  [key: string]: unknown;
}

export interface InitInput {
  appId: string;
}

export interface InitSuccessResult {
  success: true;
  /** Mirror of `GET /v1/config` `providers` (Brevis wire / synthesized). */
  providers: BnbZkIdGatewayConfigProviderWire[];
}

export type ProveStatus =
  | "initializing"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

export interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  identityPropertyId: string;
  /**
   * Optional thresholds / options: `businessParams` for Gateway alignment only; `jumpToUrl` (if set) is
   * passed as Primus `additionParams.jumpToUrl`. Other keys are ignored by the default workflow unless
   * documented otherwise.
   */
  provingParams?: ProvingParams;
}

/**
 * Snapshot emitted by `prove(..., { onProgress })` for UI updates.
 * **`clientRequestId`** is always the request id from {@link ProveInput}.
 * **`proofRequestId`** is set after the Gateway accepts `POST /v1/proof-requests` (non-empty id in the
 * response): from **`proof_generating`** through **`on_chain_attested`**. Earlier steps
 * (`initializing`, `data_verifying`) omit it; **`failed`** may omit it depending on how far the flow progressed.
 */
export interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}

export interface ProveOptions {
  /**
   * Progress callbacks; on any `prove` failure the SDK invokes this once with `status: "failed"` before throwing.
   */
  onProgress?: (event: ProveProgressEvent) => void;
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

export interface QueryProofResultInput {
  proofRequestId: string;
  clientRequestId?: string;
}

export interface QueryProofResultSuccessResult {
  status: "on_chain_attested";
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId: string;
  clientRequestId?: string;
}

export interface QueryProofResultPendingResult {
  status: "initialized" | "generating" | "submitting";
  proofRequestId: string;
  clientRequestId?: string;
}

export interface QueryProofResultTerminalResult {
  status: "prover_failed" | "packaging_failed" | "submission_failed" | "internal_error" | "failed";
  proofRequestId: string;
  clientRequestId?: string;
}

export type QueryProofResultResult =
  | QueryProofResultPendingResult
  | QueryProofResultSuccessResult
  | QueryProofResultTerminalResult;

/**
 * @deprecated Prove failures are thrown as {@link import("../errors/prove-error.js").BnbZkIdProveError}; this shape is no longer returned.
 */
export interface ProveFailureResult {
  status: "failed";
  clientRequestId: string;
  proofRequestId?: string;
  error?: BnbZkIdError;
}

/**
 * Historical union including failure; prefer {@link ProveSuccessResult} for `prove` return type.
 * @deprecated Failure is not returned; use `try/catch` with `BnbZkIdProveError`.
 */
export type ProveResult = ProveSuccessResult | ProveFailureResult;

export interface BnbZkIdClientMethods {
  /** On success returns provider metadata. On failure throws `BnbZkIdProveError`. */
  init(input: InitInput): Promise<InitSuccessResult>;
  /**
   * On success returns attested result. On any failure throws {@link import("../errors/prove-error.js").BnbZkIdProveError}
   * (`code` `00000`–`00007`, `10001`–`10013`, `20001`–`20007`, `30000`–`30005`, `40000`; `message`).
   */
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
  /**
   * Query one existing proof request by id (`GET /v1/proof-requests/{proofRequestId}`) without polling.
   * Most developers do not need to call this directly; prefer `prove(...)` for the normal flow.
   * Intended for recovery or manual status reconciliation with a known `proofRequestId`.
   * Returns the current normalized proof-request status. Throws only for invalid input, transport failures,
   * or malformed/unusable response payloads.
   */
  queryProofResult(input: QueryProofResultInput): Promise<QueryProofResultResult>;
}
