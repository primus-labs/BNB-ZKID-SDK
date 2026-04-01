/** Gateway API top-level `error` on POST/GET proof-requests (Framework: category + code + detail). */
export interface GatewayError {
  /** Framework deterministic category e.g. `policy_rejected`, `zktls_invalid`. */
  category?: string;
  /** Stable machine-readable code e.g. `VALIDATOR_UNAVAILABLE`. */
  code: string;
  /** Human-readable summary (legacy / HTTP). */
  message?: string;
  /** Human-readable detail (Framework). */
  detail?: string;
  details?: Record<string, unknown>;
}

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
   * `businessParams` (SDK passes the same object through to `prove.provingParams` / request body).
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

/** `POST /v1/proof-requests` body (`businessParams` matches /v1/config wire name; values align with `prove.provingParams`). */
export interface GatewayCreateProofRequestInput {
  appId: string;
  identityPropertyId: string;
  zkTlsProof: unknown;
  businessParams?: Record<string, unknown> | null;
}

/**
 * `POST /v1/proof-requests` JSON per Framework: `proofRequestId`, `status`, `error` only.
 */
export interface GatewayCreateProofRequestResult {
  proofRequestId: string;
  status: GatewayProofStatus;
  error?: GatewayError | null;
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
  createProofRequest(input: GatewayCreateProofRequestInput): Promise<GatewayCreateProofRequestResult>;
  getProofRequestStatus(proofRequestId: string): Promise<GatewayProofRequestStatusResult>;
}
