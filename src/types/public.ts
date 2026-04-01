export interface BnbZkIdError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * App-side name for Gateway `businessParams` on `POST /v1/proof-requests`.
 * Shape is opaque: same keys/values as `GET /v1/config` `properties[].businessParams` (SDK passes through).
 */
export type ProvingParams = Record<string, unknown>;

export interface InitInput {
  appId: string;
}

export interface InitSuccessResult {
  success: true;
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
   * Optional Gateway `businessParams` payload under the public name `provingParams`.
   * Omitted to use defaults from `GET /v1/config` `properties[].businessParams` when present.
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
}

export interface ProveSuccessResult {
  status: "on_chain_attested";
  clientRequestId: string;
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
}

export interface ProveFailureResult {
  status: "failed";
  clientRequestId: string;
  proofRequestId?: string;
  error?: BnbZkIdError;
}

export type ProveResult = ProveSuccessResult | ProveFailureResult;

export interface BnbZkIdClientMethods {
  init(input: InitInput): Promise<InitResult>;
  prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult>;
}
