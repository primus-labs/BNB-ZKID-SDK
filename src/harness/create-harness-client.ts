import { readFile } from "node:fs/promises";
import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitResult,
  ProveFailureResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveResult,
  ProvingParams
} from "../types/public.js";

interface HarnessGatewayConfig {
  appIds: string[];
  providers: Array<{
    providerId: string;
    identityProperties: Array<{
      identityPropertyId: string;
      schemaVersion: string;
    }>;
  }>;
}

interface CreateProofRequestFixture {
  proofRequestId: string;
  status: "initialized";
  providerId: string;
  identityPropertyId: string;
  createdAt?: string;
}

interface ProofRequestStatusFixture {
  proofRequestId: string;
  status: "on_chain_attested" | "failed";
  uiStatus?: "Processing" | "Completed" | "Failed";
  walletAddress?: string;
  providerId: string;
  identityPropertyId: string;
}

interface HarnessFixtures {
  config: HarnessGatewayConfig;
  createProofRequest: CreateProofRequestFixture;
  proofRequestStatus: ProofRequestStatusFixture;
}

class HarnessGatewayTransport {
  constructor(private readonly fixtures: HarnessFixtures) {}

  async getConfig(): Promise<HarnessGatewayConfig> {
    return this.fixtures.config;
  }

  async createProofRequest(input: {
    clientRequestId: string;
    userAddress: string;
    provingDataId: string;
    provingParams?: ProvingParams;
  }): Promise<CreateProofRequestFixture> {
    void input.clientRequestId;
    void input.userAddress;
    void input.provingParams;

    const provider = this.fixtures.config.providers.find((candidate) =>
      candidate.identityProperties.some(
        (property) => property.identityPropertyId === input.provingDataId
      )
    );

    if (!provider) {
      throw new ConfigurationError("Unsupported provingDataId for deterministic harness.", {
        provingDataId: input.provingDataId
      });
    }

    return {
      ...this.fixtures.createProofRequest,
      providerId: provider.providerId,
      identityPropertyId: input.provingDataId
    };
  }

  async getProofRequestStatus(proofRequestId: string): Promise<ProofRequestStatusFixture> {
    if (proofRequestId !== this.fixtures.proofRequestStatus.proofRequestId) {
      throw new ConfigurationError("Unknown proofRequestId in deterministic harness.", {
        proofRequestId
      });
    }

    return this.fixtures.proofRequestStatus;
  }
}

class HarnessBnbZkIdClient implements BnbZkIdClientMethods {
  private initializedAppId: string | undefined;

  constructor(private readonly transport: HarnessGatewayTransport) {}

  async init(input: InitInput): Promise<InitResult> {
    const appId = input.appId.trim();
    const config = await this.transport.getConfig();

    if (appId.length === 0) {
      return {
        success: false,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "appId is required."
        }
      };
    }

    if (!config.appIds.includes(appId)) {
      return {
        success: false,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "appId is not enabled in the deterministic harness.",
          details: { appId }
        }
      };
    }

    this.initializedAppId = appId;

    return { success: true };
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult> {
    if (!this.initializedAppId) {
      return this.buildFailureResult(input.clientRequestId, {
        code: "CONFIGURATION_ERROR",
        message: "init must succeed before prove can run."
      });
    }

    if (!this.isValidProvingParams(input.provingParams)) {
      return this.buildFailureResult(input.clientRequestId, {
        code: "VALIDATION_ERROR",
        message: "provingParams must be a record of numeric threshold arrays."
      });
    }

    const created = await this.transport.createProofRequest(input);
    await this.emitProgress(options, {
      status: "initialized",
      clientRequestId: input.clientRequestId,
      proofRequestId: created.proofRequestId
    });
    await this.emitProgress(options, {
      status: "data_verifying",
      clientRequestId: input.clientRequestId,
      proofRequestId: created.proofRequestId
    });
    await this.emitProgress(options, {
      status: "proof_generating",
      clientRequestId: input.clientRequestId,
      proofRequestId: created.proofRequestId
    });

    const status = await this.transport.getProofRequestStatus(created.proofRequestId);
    if (status.status === "failed") {
      await this.emitProgress(options, {
        status: "failed",
        clientRequestId: input.clientRequestId,
        proofRequestId: created.proofRequestId
      });

      return this.buildFailureResult(input.clientRequestId, {
        code: "PROOF_REQUEST_FAILED",
        message: "Deterministic harness returned a failed proof request."
      }, created.proofRequestId);
    }

    if (!status.walletAddress) {
      throw new SdkError("Harness success payload is missing walletAddress.", "VALIDATION_ERROR");
    }

    await this.emitProgress(options, {
      status: "on_chain_attested",
      clientRequestId: input.clientRequestId,
      proofRequestId: created.proofRequestId
    });

    return {
      status: "on_chain_attested",
      clientRequestId: input.clientRequestId,
      walletAddress: status.walletAddress,
      providerId: status.providerId,
      identityPropertyId: status.identityPropertyId,
      proofRequestId: created.proofRequestId
    };
  }

  private isValidProvingParams(provingParams: ProvingParams | undefined): boolean {
    if (!provingParams) {
      return true;
    }

    return Object.values(provingParams).every((values) =>
      Array.isArray(values) && values.every((value) => Number.isFinite(value))
    );
  }

  private buildFailureResult(
    clientRequestId: string,
    error: { code: string; message: string; details?: Record<string, unknown> },
    proofRequestId?: string
  ): ProveFailureResult {
    const result: ProveFailureResult = {
      status: "failed",
      clientRequestId,
      error
    };

    if (proofRequestId) {
      result.proofRequestId = proofRequestId;
    }

    return result;
  }

  private async emitProgress(options: ProveOptions | undefined, event: ProveProgressEvent): Promise<void> {
    await options?.onProgress?.(event);
  }
}

async function readJsonFixture<T>(name: string): Promise<T> {
  const file = new URL(`../../fixtures/${name}`, import.meta.url);
  const content = await readFile(file, "utf8");
  return JSON.parse(content) as T;
}

async function loadHarnessFixtures(): Promise<HarnessFixtures> {
  const [config, createProofRequest, proofRequestStatus] = await Promise.all([
    readJsonFixture<HarnessGatewayConfig>("config.json"),
    readJsonFixture<CreateProofRequestFixture>("create-proof-request.json"),
    readJsonFixture<ProofRequestStatusFixture>("get-proof-request-status.json")
  ]);

  return {
    config,
    createProofRequest,
    proofRequestStatus
  };
}

export async function createHarnessClient(): Promise<BnbZkIdClientMethods> {
  const fixtures = await loadHarnessFixtures();
  const transport = new HarnessGatewayTransport(fixtures);
  return new HarnessBnbZkIdClient(transport);
}
