import type { BnbZkIdFrameworkError } from "../types/framework-error.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";

/** Gateway API top-level `error` on POST/GET proof-requests — same as public {@link BnbZkIdFrameworkError}. */
export type GatewayError = BnbZkIdFrameworkError;

/**
 * `ProofStatus` per framework Gateway spec (`POST`/`GET /v1/proof-requests`).
 * Legacy `on_chain_attested` and `failed` are accepted for older payloads.
 */
export type GatewayProofStatus =
  | "initialized"
  | "generating"
  | "submitting"
  | "onchain_attested"
  | "prover_failed"
  | "packaging_failed"
  | "submission_failed"
  | "internal_error"
  | "on_chain_attested"
  | "failed";

export interface GatewayIdentityPropertyConfig {
  identityPropertyId: string;
  /** From Brevis `properties[].description` when present. */
  description?: string;
  schemaVersion?: string;
  /**
   * When Gateway config uses on-chain property ids but the Primus template HTTP payload
   * uses a different field name (e.g. `githubIdentityPropertyId`).
   */
  primusTemplateResponseKey?: string;
  /**
   * Brevis `GET /v1/config` may set per-property defaults for `POST /v1/proof-requests` body
   * `businessParams` (SDK aligns with `prove.provingParams.businessParams` / request body).
   */
  businessParams?: Record<string, unknown>;
}

export interface GatewayProviderConfig {
  providerId: string;
  identityProperties: GatewayIdentityPropertyConfig[];
}

export interface GatewayConfig {
  appIds: string[];
  providers: GatewayProviderConfig[];
}

/** `POST /v1/proof-requests` body (`businessParams` matches /v1/config wire name; values align with `prove.provingParams.businessParams`). */
export interface GatewayCreateProofRequestInput {
  appId: string;
  identityPropertyId: string;
  zkTlsProof: unknown;
  businessParams?: Record<string, unknown> | null;
}

/** HTTP context when the SDK parsed a proof-requests response from a non-OK status (Framework JSON body). */
export interface GatewayProofRequestHttpContext {
  httpStatus: number;
  pathname: string;
  url: string;
}

/**
 * `POST /v1/proof-requests` JSON per Framework: `proofRequestId`, `status`, `error` only.
 * `httpRequest` is SDK-only: set when `error` was read from an HTTP 4xx/5xx Framework body.
 */
export interface GatewayCreateProofRequestResult {
  proofRequestId: string;
  status: GatewayProofStatus;
  error?: GatewayError | null;
  httpRequest?: GatewayProofRequestHttpContext;
}

/** `identityProperty` on `GET /v1/proof-requests/{id}` (Framework). */
export interface GatewayStatusIdentityProperty {
  id: string;
  description?: string;
  businessParams?: Record<string, unknown>;
  /** Legacy backends may still emit this instead of `id`. */
  identityPropertyId?: string;
  schemaVersion?: string;
  [key: string]: unknown;
}

/** On-chain attestation reference (Framework). */
export interface GatewayProofAttestation {
  chainId: string;
  registry: string;
  txHash: string;
  [key: string]: unknown;
}

/** Lifecycle failure payload (Framework: `reason` + `detail`). */
export interface GatewayProofFailure {
  reason: string;
  detail: string;
  [key: string]: unknown;
}

/** @deprecated Prefer {@link GatewayProofFailure}. */
export type GatewayProofFailureDetail = GatewayProofFailure | Record<string, unknown>;

/** `GET /v1/proof-requests/{proofRequestId}` JSON. */
export interface GatewayProofRequestStatusResult {
  proofRequestId: string;
  status: GatewayProofStatus;
  error?: GatewayError | null;
  walletAddress?: string;
  providerId?: string;
  appId?: string;
  identityProperty?: GatewayStatusIdentityProperty;
  /** Legacy flat field when backend omits `identityProperty`. */
  identityPropertyId?: string;
  attestation?: GatewayProofAttestation | null;
  failure?: GatewayProofFailure | null;
  uiStatus?: "Processing" | "Completed" | "Failed";
}

export interface GatewayClient {
  getConfig(): Promise<GatewayConfig>;
  /** Public mirror of `GET /v1/config` `providers` (Brevis wire or synthesized from normalized config). */
  getConfigProvidersWire(): Promise<BnbZkIdGatewayConfigProviderWire[]>;
  createProofRequest(input: GatewayCreateProofRequestInput): Promise<GatewayCreateProofRequestResult>;
  getProofRequestStatus(proofRequestId: string): Promise<GatewayProofRequestStatusResult>;
}
