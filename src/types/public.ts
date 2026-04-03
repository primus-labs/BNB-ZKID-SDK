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
  details?: Record<string, unknown>;
}

/**
 * Gateway `businessParams` payload (`GET /v1/config` / `POST /v1/proof-requests`).
 * Opaque record; same keys/values as `properties[].businessParams` where applicable.
 */
export type BusinessParams = Record<string, unknown>;

/**
 * Carried on {@link ProveInput} as `provingParams` and serialized into Primus `additionParams.provingParams`.
 * `businessParams` is validated against `GET /v1/config` when present; other keys are forwarded as-is for future fields.
 */
export interface ProvingParams {
  businessParams?: BusinessParams;
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

export interface InitFailureResult {
  success: false;
  error?: BnbZkIdError;
}

export type InitResult = InitSuccessResult | InitFailureResult;

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
   * Optional bag for Primus `additionParams.provingParams`; `businessParams` mirrors Gateway and defaults from
   * `GET /v1/config` when omitted.
   */
  provingParams?: ProvingParams;
}

export interface ProveProgressEvent {
  status: ProveStatus;
  clientRequestId: string;
  proofRequestId?: string;
}

export interface ProveOptions {
  onProgress?: (event: ProveProgressEvent) => void;
  /**
   * When true, forwarded to `@superorange/zka-js-sdk` `generateRequestParams` options so the extension
   * may close the data-source tab after successful proof on PC.
   */
  closeDataSourceOnProofComplete?: boolean;
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

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
  init(input: InitInput): Promise<InitResult>;
  /**
   * On success returns attested result. On any failure throws {@link import("../errors/prove-error.js").BnbZkIdProveError}
   * (`code` `00000`–`00007` and `10000`–`10003`, `message`, `details`).
   */
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult>;
}
