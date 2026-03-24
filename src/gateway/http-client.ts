import { SdkError } from "../errors/sdk-error.js";
import { emitGatewayCreateProofRequestDebug } from "./debug.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "./types.js";

class HttpGatewayClient implements GatewayClient {
  constructor(private readonly baseUrl: string) {}

  async getConfig(): Promise<GatewayConfig> {
    return this.requestJson<GatewayConfig>("/v1/config", {
      method: "GET"
    });
  }

  async createProofRequest(
    input: GatewayCreateProofRequestInput
  ): Promise<GatewayCreateProofRequestResult> {
    emitGatewayCreateProofRequestDebug({
      channel: "createProofRequest",
      transport: "http",
      input
    });

    return this.requestJson<GatewayCreateProofRequestResult>("/v1/proof-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    });
  }

  async getProofRequestStatus(
    proofRequestId: string
  ): Promise<GatewayProofRequestStatusResult> {
    return this.requestJson<GatewayProofRequestStatusResult>(
      `/v1/proof-requests/${encodeURIComponent(proofRequestId)}`,
      {
        method: "GET"
      }
    );
  }

  private async requestJson<T>(pathname: string, init: RequestInit): Promise<T> {
    const response = await fetch(new URL(pathname, this.baseUrl), init);
    if (!response.ok) {
      throw new SdkError("Gateway request failed.", "TRANSPORT_ERROR", {
        status: response.status,
        pathname
      });
    }

    return (await response.json()) as T;
  }
}

export function createHttpGatewayClient(baseUrl: string): GatewayClient {
  return new HttpGatewayClient(baseUrl);
}
