import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBnbZkIdProveError, getInvalidAppIdMessage } from "../errors/prove-error.js";
import { ConfigurationError } from "../errors/sdk-error.js";
import { resolveProviderIdForIdentityPropertyId } from "../gateway/status-identity.js";
import { normalizeGatewayAttestedStatusOrThrow } from "../workflow/gateway-success-normalizer.js";
import { normalizeQueryProofResultOrThrow } from "../workflow/query-proof-result-normalizer.js";
import type {
  GatewayConfig,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "../gateway/types.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import {
  assertInitInputValidOrThrow,
  assertProveInputValidOrThrow
} from "../validation/public-input-validation.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitSuccessResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveSuccessResult,
  QueryProofResultInput,
  QueryProofResultResult
} from "../types/public.js";

interface HarnessGatewayConfig {
  appIds: string[];
  providers: Array<{
    providerId: string;
    identityProperties: Array<{
      identityPropertyId: string;
      schemaVersion: string;
      businessParams?: Record<string, unknown>;
    }>;
  }>;
}

function harnessGatewayConfigToProvidersWire(config: HarnessGatewayConfig): BnbZkIdGatewayConfigProviderWire[] {
  return config.providers.map((p) => ({
    id: p.providerId,
    properties: p.identityProperties.map((ip) => ({
      id: ip.identityPropertyId,
      ...(ip.businessParams !== undefined ? { businessParams: { ...ip.businessParams } } : {})
    }))
  }));
}

type CreateProofRequestFixture = GatewayCreateProofRequestResult;

type ProofRequestStatusFixture = GatewayProofRequestStatusResult;

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
    identityPropertyId: string;
    provingParams?: ProveInput["provingParams"];
  }): Promise<CreateProofRequestFixture> {
    void input.clientRequestId;
    void input.userAddress;
    void input.provingParams;

    const supported = this.fixtures.config.providers.some((candidate) =>
      candidate.identityProperties.some(
        (property) => property.identityPropertyId === input.identityPropertyId
      )
    );

    if (!supported) {
      throw new ConfigurationError("Unsupported identityPropertyId for deterministic harness.", {
        identityPropertyId: input.identityPropertyId
      });
    }

    return { ...this.fixtures.createProofRequest };
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
  private configProvidersWire: BnbZkIdGatewayConfigProviderWire[] | undefined;

  constructor(private readonly transport: HarnessGatewayTransport) {}

  async init(input: InitInput): Promise<InitSuccessResult> {
    assertInitInputValidOrThrow(input);
    const appId = input.appId.trim();
    const config = await this.transport.getConfig();

    if (!config.appIds.includes(appId)) {
      throw createBnbZkIdProveError("00003", {
        messageOverride: getInvalidAppIdMessage("not_enabled")
      });
    }

    this.initializedAppId = appId;
    this.configProvidersWire = harnessGatewayConfigToProvidersWire(config);

    return { success: true, providers: this.configProvidersWire };
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult> {
    const clientRequestId = input.clientRequestId;

    assertProveInputValidOrThrow(input, this.configProvidersWire ?? []);

    let created;
    try {
      created = await this.transport.createProofRequest(input);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw createBnbZkIdProveError("30002", { clientRequestId });
      }
      throw error;
    }
    await this.emitProgress(options, {
      status: "initializing",
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

    let status;
    try {
      status = await this.transport.getProofRequestStatus(created.proofRequestId);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw createBnbZkIdProveError("30002", {
          clientRequestId,
          proofRequestId: created.proofRequestId
        });
      }
      throw error;
    }

    if (
      status.status === "failed" ||
      status.status === "prover_failed" ||
      status.status === "packaging_failed" ||
      status.status === "submission_failed" ||
      status.status === "internal_error" ||
      status.failure != null
    ) {
      await this.emitProgress(options, {
        status: "failed",
        clientRequestId,
        proofRequestId: created.proofRequestId
      });

      const zkVmCode = status.status === "submission_failed" ? "40000" : "30002";
      throw createBnbZkIdProveError(zkVmCode, {
        clientRequestId,
        proofRequestId: created.proofRequestId
      });
    }

    if (status.status !== "onchain_attested" && status.status !== "on_chain_attested") {
      throw createBnbZkIdProveError("30002", {
        clientRequestId,
        proofRequestId: created.proofRequestId
      });
    }

    await this.emitProgress(options, {
      status: "on_chain_attested",
      clientRequestId,
      proofRequestId: created.proofRequestId
    });

    let normalized;
    try {
      normalized = normalizeGatewayAttestedStatusOrThrow(status);
    } catch {
      throw createBnbZkIdProveError("30002", {
        clientRequestId,
        proofRequestId: created.proofRequestId
      });
    }

    const gatewayConfig = (await this.transport.getConfig()) as unknown as GatewayConfig;
    const providerId =
      normalized.providerId ||
      resolveProviderIdForIdentityPropertyId(gatewayConfig, normalized.identityPropertyId)?.trim();
    if (!providerId) {
      throw createBnbZkIdProveError("30002", {
        clientRequestId,
        proofRequestId: created.proofRequestId
      });
    }

    return {
      status: "on_chain_attested",
      clientRequestId,
      walletAddress: normalized.walletAddress,
      providerId,
      identityPropertyId: normalized.identityPropertyId,
      proofRequestId: created.proofRequestId
    };
  }

  async queryProofResult(input: QueryProofResultInput): Promise<QueryProofResultResult> {
    const proofRequestId = input.proofRequestId.trim();
    const clientRequestId =
      typeof input.clientRequestId === "string" && input.clientRequestId.trim() !== ""
        ? input.clientRequestId.trim()
        : undefined;
    const errorContext = {
      ...(clientRequestId === undefined ? {} : { clientRequestId }),
      ...(proofRequestId === "" ? {} : { proofRequestId })
    };

    if (proofRequestId === "") {
      throw createBnbZkIdProveError("00007", clientRequestId === undefined ? undefined : { clientRequestId });
    }

    let status;
    try {
      status = await this.transport.getProofRequestStatus(proofRequestId);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw createBnbZkIdProveError("30002", errorContext);
      }
      throw error;
    }
    try {
      return normalizeQueryProofResultOrThrow({
        status,
        requestedProofRequestId: proofRequestId,
        ...(clientRequestId !== undefined ? { clientRequestId } : {})
      });
    } catch {
      throw createBnbZkIdProveError("30002", errorContext);
    }
  }

  private async emitProgress(options: ProveOptions | undefined, event: ProveProgressEvent): Promise<void> {
    await options?.onProgress?.(event);
  }
}

async function readJsonFixture<T>(name: string): Promise<T> {
  const harnessDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(harnessDir, "../../fixtures", name),
    join(harnessDir, "../../../fixtures", name)
  ];
  let lastError: unknown;
  for (const filePath of candidates) {
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw new ConfigurationError("Unable to load harness fixture JSON.", {
    name,
    tried: candidates,
    cause: lastError instanceof Error ? lastError.message : String(lastError)
  });
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
