import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredBnbZkIdClient } from "../../src/client/configured-client.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "../../src/gateway/types.js";
import type { PrimusTemplateResolver, ResolvePrimusTemplateInput } from "../../src/primus/template-resolver.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../../src/primus/types.js";

class FakeGatewayClient implements GatewayClient {
  readonly config: GatewayConfig = {
    appIds: ["listdao"],
    providers: [
      {
        providerId: "github",
        identityProperties: [
          {
            identityPropertyId: "github_account_age",
            schemaVersion: "1.0.0"
          }
        ]
      }
    ]
  };

  createdInputs: GatewayCreateProofRequestInput[] = [];
  statusResult: GatewayProofRequestStatusResult = {
    proofRequestId: "proof-request-001",
    status: "on_chain_attested",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    identityPropertyId: "github_account_age"
  };

  async getConfig(): Promise<GatewayConfig> {
    return this.config;
  }

  async createProofRequest(input: GatewayCreateProofRequestInput): Promise<GatewayCreateProofRequestResult> {
    this.createdInputs.push(input);
    return {
      proofRequestId: "proof-request-001",
      status: "initialized",
      providerId: "github",
      identityPropertyId: "github_account_age"
    };
  }

  async getProofRequestStatus(proofRequestId: string): Promise<GatewayProofRequestStatusResult> {
    assert.equal(proofRequestId, "proof-request-001");
    return this.statusResult;
  }
}

class FakePrimusAdapter implements PrimusZkTlsAdapter {
  initialized = false;
  collectedInputs: CollectPrimusAttestationInput[] = [];

  async init(): Promise<string | boolean> {
    this.initialized = true;
    return true;
  }

  async collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle> {
    this.collectedInputs.push(input);
    return {
      requestId: "primus-request-001",
      zkTlsProof: {
        public_data: {
          requestid: "primus-request-001"
        },
        private_data: [
          {
            id: "contribution",
            salt: "salt-001",
            content: ["88"]
          }
        ]
      },
      attestation: {
        requestid: "primus-request-001"
      },
      privateData: [
        {
          id: "contribution",
          salt: "salt-001",
          content: ["88"]
        }
      ]
    };
  }
}

class FakePrimusTemplateResolver implements PrimusTemplateResolver {
  readonly calls: ResolvePrimusTemplateInput[] = [];

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    this.calls.push(input);

    if (input.identityPropertyId === "github_account_age") {
      return "github-template";
    }

    throw new Error(`unexpected identityPropertyId: ${input.identityPropertyId}`);
  }
}

test("configured client runs init and prove through primus and gateway workflow", async () => {
  const gatewayClient = new FakeGatewayClient();
  const primusAdapter = new FakePrimusAdapter();
  const primusTemplateResolver = new FakePrimusTemplateResolver();
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver
  });
  const events: string[] = [];

  const initResult = await client.init({
    appId: "listdao"
  });
  assert.deepEqual(initResult, {
    success: true
  });
  assert.equal(primusAdapter.initialized, true);

  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId: "github_account_age",
      provingParams: {
        contribution: [21, 51]
      }
    },
    {
      onProgress(event) {
        events.push(event.status);
      }
    }
  );

  assert.deepEqual(events, [
    "initialized",
    "data_verifying",
    "proof_generating",
    "on_chain_attested"
  ]);
  assert.deepEqual(primusTemplateResolver.calls, [
    {
      appId: "listdao",
      identityPropertyId: "github_account_age"
    }
  ]);
  assert.equal(primusAdapter.collectedInputs.length, 1);
  assert.equal(primusAdapter.collectedInputs[0]?.templateId, "github-template");
  assert.equal(gatewayClient.createdInputs.length, 1);
  assert.deepEqual(gatewayClient.createdInputs[0], {
    appId: "listdao",
    identityPropertyId: "github_account_age",
    zkTlsProof: {
      public_data: {
        requestid: "primus-request-001"
      },
      private_data: [
        {
          id: "contribution",
          salt: "salt-001",
          content: ["88"]
        }
      ]
    },
    businessParams: {
      contribution: [21, 51]
    }
  });
  assert.equal(proveResult.status, "on_chain_attested");
});

test("configured client returns failure when prove runs before init", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  const result = await client.prove({
    clientRequestId: "prove-task-001",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    identityPropertyId: "github_account_age"
  });

  assert.deepEqual(result, {
    status: "failed",
    clientRequestId: "prove-task-001",
    error: {
      code: "CONFIGURATION_ERROR",
      message: "init must succeed before prove can run."
    }
  });
});

test("configured client returns failed result when gateway status fails", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.statusResult = {
    proofRequestId: "proof-request-001",
    status: "failed",
    providerId: "github",
    identityPropertyId: "github_account_age",
    error: {
      code: "REMOTE_FAILURE",
      message: "proof generation failed"
    }
  };

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({
    appId: "listdao"
  });

  const result = await client.prove({
    clientRequestId: "prove-task-001",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    identityPropertyId: "github_account_age"
  });

  assert.deepEqual(result, {
    status: "failed",
    clientRequestId: "prove-task-001",
    proofRequestId: "proof-request-001",
    error: {
      code: "REMOTE_FAILURE",
      message: "proof generation failed"
    }
  });
});
