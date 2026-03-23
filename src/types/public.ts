export interface BnbZkIdError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

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
  | "initialized"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

export interface ProveInput {
  clientRequestId: string;
  userAddress: string;
  provingDataId: string;
  provingParams?: Record<string, unknown>;
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
