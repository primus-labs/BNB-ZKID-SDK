import { SdkError } from "../errors/sdk-error.js";
import { emitGatewayCreateProofRequestDebug } from "./debug.js";
import {
  extractPublicProvidersWireFromConfigRaw,
  normalizeGatewayConfigPayload
} from "./normalize-config.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import {
  findIdentityPropertyConfig,
  gatewayConfigToStatusIdentityProperty
} from "./status-identity.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "./types.js";

interface BrowserFixtureGatewayFiles {
  configUrl: string;
  createProofRequestUrl: string;
  proofRequestStatusUrl: string;
}

class BrowserFixtureGatewayClient implements GatewayClient {
  private fixturesPromise:
    | Promise<{
        configRaw: unknown;
        config: GatewayConfig;
        createProofRequest: GatewayCreateProofRequestResult;
        proofRequestStatus: GatewayProofRequestStatusResult;
      }>
    | undefined;
  private lastCreatedRequest:
    | {
        providerId: string;
        identityPropertyId: string;
        proofRequestId: string;
      }
    | undefined;

  constructor(private readonly files: BrowserFixtureGatewayFiles) {}

  async getConfig(): Promise<GatewayConfig> {
    return (await this.getFixtures()).config;
  }

  async getConfigProvidersWire(): Promise<BnbZkIdGatewayConfigProviderWire[]> {
    const f = await this.getFixtures();
    return extractPublicProvidersWireFromConfigRaw(f.configRaw, f.config);
  }

  async createProofRequest(
    input: GatewayCreateProofRequestInput
  ): Promise<GatewayCreateProofRequestResult> {
    emitGatewayCreateProofRequestDebug({
      channel: "createProofRequest",
      transport: "fixture",
      input
    });

    const fixtures = await this.getFixtures();
    const provider = fixtures.config.providers.find((candidate) =>
      candidate.identityProperties.some(
        (property) => property.identityPropertyId === input.identityPropertyId
      )
    );

    if (!provider) {
      throw new SdkError("Unsupported identityPropertyId for browser fixture gateway.", "CONFIGURATION_ERROR", {
        identityPropertyId: input.identityPropertyId
      });
    }

    this.lastCreatedRequest = {
      providerId: provider.providerId,
      identityPropertyId: input.identityPropertyId,
      proofRequestId: fixtures.createProofRequest.proofRequestId
    };

    return { ...fixtures.createProofRequest };
  }

  async getProofRequestStatus(
    proofRequestId: string
  ): Promise<GatewayProofRequestStatusResult> {
    const fixtures = await this.getFixtures();
    if (proofRequestId !== fixtures.proofRequestStatus.proofRequestId) {
      throw new SdkError("Unknown proofRequestId in browser fixture gateway.", "CONFIGURATION_ERROR", {
        proofRequestId
      });
    }

    const base = fixtures.proofRequestStatus;
    if (this.lastCreatedRequest === undefined) {
      return base;
    }

    const ipCfg = findIdentityPropertyConfig(fixtures.config, this.lastCreatedRequest.identityPropertyId);
    const identityProperty = ipCfg
      ? gatewayConfigToStatusIdentityProperty(ipCfg)
      : base.identityProperty;

    return {
      ...base,
      proofRequestId: this.lastCreatedRequest.proofRequestId,
      providerId: base.providerId ?? this.lastCreatedRequest.providerId,
      ...(identityProperty !== undefined ? { identityProperty } : {}),
      identityPropertyId: this.lastCreatedRequest.identityPropertyId
    };
  }

  private async getFixtures(): Promise<{
    configRaw: unknown;
    config: GatewayConfig;
    createProofRequest: GatewayCreateProofRequestResult;
    proofRequestStatus: GatewayProofRequestStatusResult;
  }> {
    if (!this.fixturesPromise) {
      this.fixturesPromise = Promise.all([
        fetchJson<unknown>(this.files.configUrl),
        fetchJson<GatewayCreateProofRequestResult>(this.files.createProofRequestUrl),
        fetchJson<GatewayProofRequestStatusResult>(this.files.proofRequestStatusUrl)
      ]).then(([configRaw, createProofRequest, proofRequestStatus]) => ({
        configRaw,
        config: normalizeGatewayConfigPayload(configRaw),
        createProofRequest,
        proofRequestStatus
      }));
    }

    return this.fixturesPromise;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new SdkError("Unable to fetch browser fixture file.", "CONFIGURATION_ERROR", {
      url,
      status: response.status
    });
  }

  return (await response.json()) as T;
}

export function createBrowserFixtureGatewayClient(files: BrowserFixtureGatewayFiles): GatewayClient {
  return new BrowserFixtureGatewayClient(files);
}
