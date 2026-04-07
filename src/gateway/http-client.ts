import { GATEWAY_API_ERROR_CODE, SdkError } from "../errors/sdk-error.js";
import { flatDetailsFromFrameworkError } from "./framework-error-flat.js";
import { joinBaseUrlAndPath } from "../util/join-base-url.js";
import { emitGatewayCreateProofRequestDebug } from "./debug.js";
import {
  extractPublicProvidersWireFromConfigRaw,
  normalizeGatewayConfigPayload
} from "./normalize-config.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayError,
  GatewayProofRequestStatusResult,
  GatewayProofStatus
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeGatewayProofRequestError(value: unknown): value is GatewayError {
  return isRecord(value) && typeof value.code === "string" && value.code.trim().length > 0;
}

/**
 * Brevis may respond with HTTP 4xx/5xx while still returning a Framework `{ error: { category, code, message|detail } }` body.
 * Treat that as a normal `GatewayCreateProofRequestResult` instead of throwing `TRANSPORT_ERROR`.
 */
function parseCreateProofRequestResponse(
  response: Response,
  body: unknown,
  pathname: string,
  url: string
): GatewayCreateProofRequestResult {
  if (response.ok) {
    return body as GatewayCreateProofRequestResult;
  }

  if (isRecord(body) && body.error != null && looksLikeGatewayProofRequestError(body.error)) {
    const proofRequestId =
      typeof body.proofRequestId === "string" && body.proofRequestId.trim() !== ""
        ? body.proofRequestId.trim()
        : "";
    const status: GatewayProofStatus =
      typeof body.status === "string" ? (body.status as GatewayProofStatus) : "failed";
    return {
      proofRequestId,
      status,
      error: body.error as GatewayError,
      httpRequest: {
        httpStatus: response.status,
        pathname,
        url
      }
    };
  }

  throw new SdkError("Gateway request failed.", "TRANSPORT_ERROR", {
    httpStatus: response.status,
    pathname,
    url
  });
}

/**
 * Non-OK `GET /v1/proof-requests/{id}` may still return a Framework `{ error: { category, code, message|detail } }` body.
 * Surface that as {@link GATEWAY_API_ERROR_CODE} instead of a bare `TRANSPORT_ERROR`.
 */
function parseGetProofRequestStatusResponse(
  response: Response,
  body: unknown,
  pathname: string,
  url: string
): GatewayProofRequestStatusResult {
  if (response.ok) {
    return body as GatewayProofRequestStatusResult;
  }

  if (isRecord(body) && body.error != null && looksLikeGatewayProofRequestError(body.error)) {
    const wireStatus =
      typeof body.status === "string" ? (body.status as GatewayProofStatus) : undefined;
    throw new SdkError("Gateway proof request query failed.", GATEWAY_API_ERROR_CODE, {
      phase: "getProofRequestStatus",
      httpStatus: response.status,
      pathname,
      url,
      ...(wireStatus !== undefined ? { status: wireStatus } : {}),
      ...flatDetailsFromFrameworkError(body.error as GatewayError)
    });
  }

  throw new SdkError("Gateway request failed.", "TRANSPORT_ERROR", {
    httpStatus: response.status,
    pathname,
    url
  });
}

class HttpGatewayClient implements GatewayClient {
  private configBundlePromise:
    | Promise<{ raw: unknown; normalized: GatewayConfig }>
    | undefined;

  constructor(private readonly baseUrl: string) {}

  private async loadConfigBundle(): Promise<{ raw: unknown; normalized: GatewayConfig }> {
    if (!this.configBundlePromise) {
      this.configBundlePromise = this.requestJson<unknown>("/v1/config", {
        method: "GET"
      }).then((raw) => ({
        raw,
        normalized: normalizeGatewayConfigPayload(raw)
      }));
    }
    return this.configBundlePromise;
  }

  async getConfig(): Promise<GatewayConfig> {
    return (await this.loadConfigBundle()).normalized;
  }

  async getConfigProvidersWire(): Promise<BnbZkIdGatewayConfigProviderWire[]> {
    const b = await this.loadConfigBundle();
    return extractPublicProvidersWireFromConfigRaw(b.raw, b.normalized);
  }

  async createProofRequest(
    input: GatewayCreateProofRequestInput
  ): Promise<GatewayCreateProofRequestResult> {
    emitGatewayCreateProofRequestDebug({
      channel: "createProofRequest",
      transport: "http",
      input
    });

    const pathname = "/v1/proof-requests";
    const url = this.resolveRequestUrl(pathname);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SdkError("Gateway returned a non-JSON response.", "TRANSPORT_ERROR", {
        httpStatus: response.status,
        pathname,
        url: url.toString()
      });
    }

    return parseCreateProofRequestResponse(response, body, pathname, url.toString());
  }

  async getProofRequestStatus(
    proofRequestId: string
  ): Promise<GatewayProofRequestStatusResult> {
    const pathname = `/v1/proof-requests/${encodeURIComponent(proofRequestId)}`;
    const url = this.resolveRequestUrl(pathname);
    const response = await fetch(url, { method: "GET" });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SdkError("Gateway returned a non-JSON response.", "TRANSPORT_ERROR", {
        httpStatus: response.status,
        pathname,
        url: url.toString()
      });
    }

    return parseGetProofRequestStatusResponse(response, body, pathname, url.toString());
  }

  private resolveRequestUrl(pathname: string): URL {
    return joinBaseUrlAndPath(this.baseUrl, pathname);
  }

  private async requestJson<T>(pathname: string, init: RequestInit): Promise<T> {
    const url = this.resolveRequestUrl(pathname);
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new SdkError("Gateway request failed.", "TRANSPORT_ERROR", {
        httpStatus: response.status,
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
