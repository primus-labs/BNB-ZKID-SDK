export interface GatewayConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ClientConfig {
  gateway?: GatewayConfig;
}

export type ProofRequestStatus = "initialized" | "generating" | "submitting" | "on_chain_attested" | "failed";

export interface BnbZkIdError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ProveInput {
  userAddress: string;
  provingDataId: string;
  provingParams?: Record<string, unknown>;
}

export interface ProveResult {
  accepted: boolean;
  proofRequestId?: string;
  queryKey?: string;
  error?: BnbZkIdError;
}

export interface QueryInput {
  proofRequestId?: string;
  queryKey?: string;
  userAddress?: string;
}

export interface QueryRecord {
  registryAddress?: string;
  userAddress?: string;
  providerId?: string;
  identityProperty?: string;
  txHash?: string;
  attestedAt?: string;
  value?: unknown;
}

export interface QueryResult {
  status: "pending" | "completed" | "failed";
  proofRequestStatus?: ProofRequestStatus;
  record?: QueryRecord;
  error?: BnbZkIdError;
}

export interface BnbZkIdClientMethods {
  init(): Promise<boolean>;
  prove(input: ProveInput): Promise<ProveResult>;
  query(input: QueryInput): Promise<QueryResult>;
}
