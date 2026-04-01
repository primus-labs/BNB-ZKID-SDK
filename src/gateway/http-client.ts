import { SdkError } from "../errors/sdk-error.js";
import { joinBaseUrlAndPath } from "../util/join-base-url.js";
import { emitGatewayCreateProofRequestDebug } from "./debug.js";
import { normalizeGatewayConfigPayload } from "./normalize-config.js";
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
    const raw = await this.requestJson<unknown>("/v1/config", {
      method: "GET"
    });
    return normalizeGatewayConfigPayload(raw);
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

  private resolveRequestUrl(pathname: string): URL {
    return joinBaseUrlAndPath(this.baseUrl, pathname);
  }

  private async requestJson<T>(pathname: string, init: RequestInit): Promise<T> {
    const url = this.resolveRequestUrl(pathname);
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new SdkError("Gateway request failed.", "TRANSPORT_ERROR", {
        status: response.status,
        pathname,
        url: url.toString()
      });
    }

    return (await response.json()) as T;
  }
}

export function createHttpGatewayClient(baseUrl: string): GatewayClient {
  return new HttpGatewayClient(baseUrl);
}
