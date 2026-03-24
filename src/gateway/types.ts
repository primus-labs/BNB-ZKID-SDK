export interface GatewayIdentityPropertyConfig {
  identityPropertyId: string;
  schemaVersion?: string;
}

export interface GatewayProviderConfig {
  providerId: string;
  identityProperties: GatewayIdentityPropertyConfig[];
}

export interface GatewayConfig {
  appIds: string[];
  providers: GatewayProviderConfig[];
}

export interface GatewayCreateProofRequestInput {
  appId: string;
  identityPropertyId: string;
  zkTlsProof: unknown;
  businessParams?: Record<string, unknown>;
}

export interface GatewayCreateProofRequestResult {
  proofRequestId: string;
  status: "initialized" | "generating" | "submitting" | "on_chain_attested" | "failed";
  providerId: string;
  identityPropertyId: string;
  createdAt?: string;
}

export interface GatewayProofRequestStatusResult {
  proofRequestId: string;
  status: "initialized" | "generating" | "submitting" | "on_chain_attested" | "failed";
  walletAddress?: string;
  providerId: string;
  identityPropertyId: string;
  uiStatus?: "Processing" | "Completed" | "Failed";
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface GatewayClient {
  getConfig(): Promise<GatewayConfig>;
  createProofRequest(input: GatewayCreateProofRequestInput): Promise<GatewayCreateProofRequestResult>;
  getProofRequestStatus(proofRequestId: string): Promise<GatewayProofRequestStatusResult>;
}
