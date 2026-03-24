import { readFile } from "node:fs/promises";
import path from "node:path";
import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "./types.js";

interface FixtureGatewayFiles {
  configPath: string;
  createProofRequestPath: string;
  proofRequestStatusPath: string;
}

class FixtureGatewayClient implements GatewayClient {
  private fixturesPromise:
    | Promise<{
        config: GatewayConfig;
        createProofRequest: GatewayCreateProofRequestResult;
        proofRequestStatus: GatewayProofRequestStatusResult;
      }>
    | undefined;

  constructor(private readonly files: FixtureGatewayFiles) {}

  async getConfig(): Promise<GatewayConfig> {
    return (await this.getFixtures()).config;
  }

  async createProofRequest(
    input: GatewayCreateProofRequestInput
  ): Promise<GatewayCreateProofRequestResult> {
    const fixtures = await this.getFixtures();
    const provider = fixtures.config.providers.find((candidate) =>
      candidate.identityProperties.some(
        (property) => property.identityPropertyId === input.identityPropertyId
      )
    );

    if (!provider) {
      throw new ConfigurationError("Unsupported identityPropertyId for fixture gateway.", {
        identityPropertyId: input.identityPropertyId
      });
    }

    return {
      ...fixtures.createProofRequest,
      providerId: provider.providerId,
      identityPropertyId: input.identityPropertyId
    };
  }

  async getProofRequestStatus(
    proofRequestId: string
  ): Promise<GatewayProofRequestStatusResult> {
    const fixtures = await this.getFixtures();
    if (proofRequestId !== fixtures.proofRequestStatus.proofRequestId) {
      throw new ConfigurationError("Unknown proofRequestId in fixture gateway.", {
        proofRequestId
      });
    }

    return fixtures.proofRequestStatus;
  }

  private async getFixtures(): Promise<{
    config: GatewayConfig;
    createProofRequest: GatewayCreateProofRequestResult;
    proofRequestStatus: GatewayProofRequestStatusResult;
  }> {
    if (!this.fixturesPromise) {
      this.fixturesPromise = Promise.all([
        readJsonFixture<GatewayConfig>(this.files.configPath),
        readJsonFixture<GatewayCreateProofRequestResult>(this.files.createProofRequestPath),
        readJsonFixture<GatewayProofRequestStatusResult>(this.files.proofRequestStatusPath)
      ]).then(([config, createProofRequest, proofRequestStatus]) => ({
        config,
        createProofRequest,
        proofRequestStatus
      }));
    }

    return this.fixturesPromise;
  }
}

async function readJsonFixture<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    throw new SdkError("Unable to load fixture gateway file.", "CONFIGURATION_ERROR", {
      filePath,
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

export function createFixtureGatewayClient(files: FixtureGatewayFiles): GatewayClient {
  return new FixtureGatewayClient({
    configPath: path.resolve(files.configPath),
    createProofRequestPath: path.resolve(files.createProofRequestPath),
    proofRequestStatusPath: path.resolve(files.proofRequestStatusPath)
  });
}
