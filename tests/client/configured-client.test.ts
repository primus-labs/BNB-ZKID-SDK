import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredBnbZkIdClient } from "../../src/client/configured-client.js";
import {
  BnbZkIdProveError,
  getDefaultProveErrorMessage,
  INIT_FAILURE_REASON_PRIMUS_INIT,
  INIT_FAILURE_REASON_PROVE_BEFORE_INIT,
  MESSAGE_PROVE_BEFORE_INIT
} from "../../src/errors/prove-error.js";
import { extractPublicProvidersWireFromConfigRaw } from "../../src/gateway/normalize-config.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayCreateProofRequestInput,
  GatewayCreateProofRequestResult,
  GatewayProofRequestStatusResult
} from "../../src/gateway/types.js";
import type {
  ResolvePrimusAppInput,
  ResolvePrimusAppResult,
  PrimusTemplateResolver,
  ResolvePrimusTemplateInput,
  ResolvePrimusTemplateResult
} from "../../src/primus/template-resolver.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../../src/primus/types.js";

class FakeGatewayClient implements GatewayClient {
  readonly config: GatewayConfig = {
    appIds: ["brevisListaDAO"],
    providers: [
      {
        providerId: "github",
        identityProperties: [
          {
            identityPropertyId: "github_account_age",
            schemaVersion: "1.0.0",
            businessParams: {
              contribution: [21, 51]
            }
          }
        ]
      }
    ]
  };

  createdInputs: GatewayCreateProofRequestInput[] = [];
  statusResult: GatewayProofRequestStatusResult = {
    proofRequestId: "proof-request-001",
    status: "onchain_attested",
    error: null,
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    appId: "brevisListaDAO",
    identityProperty: {
      id: "github_account_age",
      description: "GitHub account age",
      schemaVersion: "1.0.0"
    },
    identityPropertyId: "github_account_age",
    attestation: {
      chainId: "56",
      registry: "0x0000000000000000000000000000000000000001",
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    failure: null
  };

  async getConfig(): Promise<GatewayConfig> {
    return this.config;
  }

  async getConfigProvidersWire() {
    return extractPublicProvidersWireFromConfigRaw(this.config, this.config);
  }

  async createProofRequest(input: GatewayCreateProofRequestInput): Promise<GatewayCreateProofRequestResult> {
    this.createdInputs.push(input);
    return {
      proofRequestId: "proof-request-001",
      status: "initialized",
      error: null
    };
  }

  async getProofRequestStatus(proofRequestId: string): Promise<GatewayProofRequestStatusResult> {
    assert.equal(proofRequestId, "proof-request-001");
    return this.statusResult;
  }
}

class FakePrimusAdapter implements PrimusZkTlsAdapter {
  initialized = false;
  initAppIds: string[] = [];
  collectedInputs: CollectPrimusAttestationInput[] = [];

  async init(appId?: string): Promise<string | boolean> {
    this.initialized = true;
    if (appId !== undefined) {
      this.initAppIds.push(appId);
    }
    return true;
  }

  async collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle> {
    if (!this.initialized) {
      await this.init(input.zktlsAppId);
    }

    await input.onBeforeStartAttestation?.();
    const { onBeforeStartAttestation: _hook, ...inputWithoutHook } = input;
    void _hook;
    this.collectedInputs.push(inputWithoutHook as CollectPrimusAttestationInput);
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
  readonly appCalls: ResolvePrimusAppInput[] = [];
  readonly calls: ResolvePrimusTemplateInput[] = [];

  async resolveAppConfig(input: ResolvePrimusAppInput): Promise<ResolvePrimusAppResult> {
    this.appCalls.push(input);
    return {
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    };
  }

  async resolveTemplate(input: ResolvePrimusTemplateInput): Promise<ResolvePrimusTemplateResult> {
    this.calls.push(input);

    if (input.identityPropertyId === "github_account_age") {
      return {
        templateId: "github-template",
        zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
      };
    }

    throw new Error(`unexpected identityPropertyId: ${input.identityPropertyId}`);
  }

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    return (await this.resolveTemplate(input)).templateId;
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
    appId: "brevisListaDAO"
  });
  assert.deepEqual(initResult, {
    success: true,
    providers: [
      {
        id: "github",
        properties: [
          {
            id: "github_account_age",
            businessParams: {
              contribution: [21, 51]
            }
          }
        ]
      }
    ]
  });
  assert.equal(primusAdapter.initialized, true);
  assert.deepEqual(primusTemplateResolver.appCalls, [
    {
      appId: "brevisListaDAO"
    }
  ]);
  assert.deepEqual(primusAdapter.initAppIds, ["0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"]);

  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId: "github_account_age",
      provingParams: {
        businessParams: {
          contribution: [21, 51]
        }
      }
    },
    {
      onProgress(event) {
        events.push(event.status);
      }
    }
  );

  assert.deepEqual(events, [
    "initializing",
    "data_verifying",
    "proof_generating",
    "on_chain_attested"
  ]);
  assert.deepEqual(primusTemplateResolver.calls, [
    {
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    }
  ]);
  assert.equal(primusAdapter.initialized, true);
  assert.deepEqual(primusAdapter.initAppIds, ["0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"]);
  assert.equal(primusAdapter.collectedInputs.length, 1);
  assert.deepEqual(primusAdapter.collectedInputs[0], {
    templateId: "github-template",
    zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    additionParams: {
      appId: "brevisListaDAO",
      clientRequestId: "prove-task-001",
      identityPropertyId: "github_account_age"
    }
  });
  assert.equal(gatewayClient.createdInputs.length, 1);
  assert.deepEqual(gatewayClient.createdInputs[0], {
    appId: "brevisListaDAO",
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

test("configured client fills businessParams from init config when prove input omits them", async () => {
  const gatewayClient = new FakeGatewayClient();
  const primusAdapter = new FakePrimusAdapter();
  const primusTemplateResolver = new FakePrimusTemplateResolver();
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver
  });

  await client.init({
    appId: "brevisListaDAO"
  });

  await client.prove({
    clientRequestId: "prove-task-implicit-business-params",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    identityPropertyId: "github_account_age",
    provingParams: {
      locale: "en-US"
    }
  });

  assert.equal(primusAdapter.collectedInputs.length, 1);
  assert.equal(primusAdapter.collectedInputs[0]?.additionParams?.provingParams, undefined);
  assert.deepEqual(primusAdapter.collectedInputs[0]?.additionParams, {
    appId: "brevisListaDAO",
    clientRequestId: "prove-task-implicit-business-params",
    identityPropertyId: "github_account_age"
  });
  assert.deepEqual(gatewayClient.createdInputs[0]?.businessParams, {
    contribution: [21, 51]
  });
});

test("configured client throws 00007 when provingParams do not match config businessParams", async () => {
  const gatewayClient = new FakeGatewayClient();
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age",
        provingParams: {
          businessParams: {
            contribution: [99]
          }
        }
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal((err as BnbZkIdProveError).proveCode, "00007");
      assert.equal((err as BnbZkIdProveError).message, "Invalid parameters");
      assert.equal((err as BnbZkIdProveError).details.field, "provingParams.businessParams");
      assert.ok(typeof (err as BnbZkIdProveError).details.message === "string");
      return true;
    }
  );
});

test("configured client throws 00007 when init appId is empty", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(async () => client.init({ appId: "   " }), (err: unknown) => {
    assert.ok(err instanceof BnbZkIdProveError);
    assert.equal((err as BnbZkIdProveError).proveCode, "00007");
    assert.equal((err as BnbZkIdProveError).details.field, "appId");
    return true;
  });
});

class PrimusAdapterInitThrows implements PrimusZkTlsAdapter {
  constructor(private readonly thrown: unknown) {}

  async init(): Promise<string | boolean> {
    throw this.thrown;
  }

  async collectAttestationBundle(): Promise<PrimusAttestationBundle> {
    throw new Error("not used");
  }
}

test("configured client returns init failure when primus init throws plain sdk object (e.g. 00006)", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new PrimusAdapterInitThrows({ code: "00006" }),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  const initResult = await client.init({ appId: "brevisListaDAO" });
  assert.equal(initResult.success, false);
  if (initResult.success) {
    assert.fail("expected init failure");
  }
  assert.equal(initResult.error?.code, "00000");
  assert.equal(initResult.error?.message, getDefaultProveErrorMessage("00000"));
  assert.equal(initResult.error?.details?.reason, INIT_FAILURE_REASON_PRIMUS_INIT);
  const primus = initResult.error?.details?.primus as { code?: string } | undefined;
  assert.equal(primus?.code, "00006");
});

test("configured client returns init failure when primus init throws Error", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new PrimusAdapterInitThrows(new Error("network down")),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  const initResult = await client.init({ appId: "brevisListaDAO" });
  assert.equal(initResult.success, false);
  if (initResult.success) {
    assert.fail("expected init failure");
  }
  assert.equal(initResult.error?.code, "00001");
  assert.equal(initResult.error?.message, getDefaultProveErrorMessage("00001"));
  assert.equal(initResult.error?.details?.reason, INIT_FAILURE_REASON_PRIMUS_INIT);
  const primus = initResult.error?.details?.primus as { cause?: { message?: string } } | undefined;
  assert.equal(primus?.cause?.message, "network down");
});

test("configured client throws 00007 when userAddress is not a valid EVM address", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "not-a-wallet",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal((err as BnbZkIdProveError).proveCode, "00007");
      assert.equal((err as BnbZkIdProveError).details.field, "userAddress");
      return true;
    }
  );
});

test("configured client throws 00007 when identityPropertyId is not in GET /v1/config providers wire", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "unknown_property_id"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal((err as BnbZkIdProveError).proveCode, "00007");
      assert.equal((err as BnbZkIdProveError).details.field, "identityPropertyId");
      assert.equal((err as BnbZkIdProveError).details.value, "unknown_property_id");
      return true;
    }
  );
});

test("configured client throws 00001 when prove runs before init", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "00001");
      assert.equal(err.message, MESSAGE_PROVE_BEFORE_INIT);
      assert.equal(
        (err as BnbZkIdProveError).details.reason,
        INIT_FAILURE_REASON_PROVE_BEFORE_INIT
      );
      assert.equal(err.clientRequestId, "prove-task-001");
      return true;
    }
  );
});

test("configured client throws 10003 when gateway poll returns terminal error", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.statusResult = {
    proofRequestId: "proof-request-001",
    status: "failed",
    providerId: "github",
    identityPropertyId: "github_account_age",
    identityProperty: { id: "github_account_age" },
    error: {
      code: "REMOTE_FAILURE",
      message: "proof generation failed"
    },
    failure: null,
    attestation: null
  };

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({
    appId: "brevisListaDAO"
  });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "10003");
      assert.equal(err.proofRequestId, "proof-request-001");
      const brevis = err.details.brevis as Record<string, unknown>;
      assert.equal(brevis.phase, "getProofRequestStatus");
      assert.equal(brevis.status, "failed");
      assert.equal(brevis.code, "REMOTE_FAILURE");
      assert.equal(brevis.message, "proof generation failed");
      return true;
    }
  );
});

test("configured client throws 10003 when gateway poll returns prover_failed with failure object", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.statusResult = {
    proofRequestId: "proof-request-001",
    status: "prover_failed",
    providerId: "github",
    identityPropertyId: "github_account_age",
    identityProperty: { id: "github_account_age" },
    error: null,
    failure: {
      reason: "PROVER_CRASHED",
      detail: "Prover exited with code 1"
    },
    attestation: null
  };

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "10003");
      const brevis = err.details.brevis as Record<string, unknown>;
      assert.equal(brevis.phase, "pollProofRequestTerminal");
      assert.equal(brevis.status, "prover_failed");
      assert.deepEqual(brevis.failure, {
        reason: "PROVER_CRASHED",
        detail: "Prover exited with code 1"
      });
      return true;
    }
  );
});

test("configured client throws 10003 when createProofRequest returns gateway error body", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.createProofRequest = async (input) => {
    gatewayClient.createdInputs.push(input);
    return {
      proofRequestId: "proof-request-001",
      status: "failed",
      error: {
        category: "policy_rejected",
        code: "STEAM_POLICY_CHECK_FAILED",
        message: "steam special policy not satisfied"
      }
    };
  };

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "10003");
      assert.equal(err.message, "Failed to generate zkVM proof");
      const brevis = err.details.brevis as Record<string, unknown>;
      assert.equal(brevis.phase, "createProofRequest");
      assert.equal(brevis.category, "policy_rejected");
      assert.equal(brevis.code, "STEAM_POLICY_CHECK_FAILED");
      assert.equal(brevis.message, "steam special policy not satisfied");
      return true;
    }
  );
});

test("configured client throws 10003 with zkVM outer message when create returns zktls_invalid", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.createProofRequest = async (input) => {
    gatewayClient.createdInputs.push(input);
    return {
      proofRequestId: "proof-request-001",
      status: "failed",
      error: {
        category: "zktls_invalid",
        code: "ZKTLS_VERIFICATION_FAILED",
        message: "zkTls verification failed"
      }
    };
  };

  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-task-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal((err as BnbZkIdProveError).proveCode, "10003");
      assert.equal((err as BnbZkIdProveError).message, "Failed to generate zkVM proof");
      assert.deepEqual((err as BnbZkIdProveError).details, {
        brevis: {
          phase: "createProofRequest",
          category: "zktls_invalid",
          code: "ZKTLS_VERIFICATION_FAILED",
          message: "zkTls verification failed"
        }
      });
      return true;
    }
  );
});
