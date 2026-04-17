import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredBnbZkIdClient } from "../../src/client/configured-client.js";
import {
  BnbZkIdProveError
} from "../../src/errors/prove-error.js";
import { GATEWAY_API_ERROR_CODE, SdkError } from "../../src/errors/sdk-error.js";
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

const originalFetch = globalThis.fetch;
let whitelistFetchHandler: (url: URL) => unknown | Promise<unknown> = () => ({
  rc: 0,
  mc: "SUCCESS",
  msg: "",
  result: true
});

test.beforeEach(() => {
  whitelistFetchHandler = () => ({
    rc: 0,
    mc: "SUCCESS",
    msg: "",
    result: true
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl);
    if (
      url.origin === "https://api-dev.padolabs.org" &&
      url.pathname === "/public/zkid/whitelist/check"
    ) {
      void init;
      const payload = await whitelistFetchHandler(url);
      return {
        ok: true,
        status: 200,
        json: async () => payload
      } as Response;
    }
    if (originalFetch === undefined) {
      throw new Error(`Unexpected fetch call in test: ${rawUrl}`);
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

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

test("configured client throws 30002 when provingParams do not match config businessParams", async () => {
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
      assert.equal((err as BnbZkIdProveError).proveCode, "30002");
      assert.equal((err as BnbZkIdProveError).message, "Proof generation failure.");
      return true;
    }
  );
});

test("configured client throws 00003 when init appId is empty", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(async () => client.init({ appId: "   " }), (err: unknown) => {
    assert.ok(err instanceof BnbZkIdProveError);
    assert.equal((err as BnbZkIdProveError).proveCode, "00003");
    assert.equal((err as BnbZkIdProveError).message, "Invalid appId. [SDK-A00].");
    return true;
  });
});


test("configured client throws 00002 when userAddress is not a valid EVM address", async () => {
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
      assert.equal((err as BnbZkIdProveError).proveCode, "00002");
      return true;
    }
  );
});

test("configured client throws 00004 when identityPropertyId is not in init().providers wire", async () => {
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
      assert.equal((err as BnbZkIdProveError).proveCode, "00004");
      assert.equal((err as BnbZkIdProveError).message, "Invalid identityPropertyId. [SDK-I01].");
      return true;
    }
  );
});


test("configured client throws 30002 when gateway poll returns terminal error", async () => {
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
      assert.equal(err.proveCode, "30002");
      return true;
    }
  );
});

test("configured client throws 30002 when gateway poll returns prover_failed with failure object", async () => {
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
      assert.equal(err.proveCode, "30002");
      return true;
    }
  );
});

test("configured client throws 30002 when createProofRequest returns gateway error body", async () => {
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
      assert.equal(err.proveCode, "30002");
      assert.equal(err.message, "Proof generation failure.");
      return true;
    }
  );
});

test("configured client throws 30002 with zkVM outer message when create returns zktls_invalid", async () => {
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
      assert.equal((err as BnbZkIdProveError).proveCode, "30002");
      assert.equal((err as BnbZkIdProveError).message, "Proof generation failure.");
      return true;
    }
  );
});

test("configured client throws 00003 A01 when appId is not enabled", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(async () => client.init({ appId: "unknown-app" }), (err: unknown) => {
    assert.ok(err instanceof BnbZkIdProveError);
    assert.equal((err as BnbZkIdProveError).proveCode, "00003");
    assert.equal((err as BnbZkIdProveError).message, "Invalid appId. [SDK-A01].");
    return true;
  });
});

test("configured client throws 00001 when prove is called before init", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "prove-before-init",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal((err as BnbZkIdProveError).proveCode, "00001");
      assert.equal(
        (err as BnbZkIdProveError).message,
        "SDK initialization failed. Please call init() successfully before calling prove()."
      );
      assert.equal((err as BnbZkIdProveError).clientRequestId, "prove-before-init");
      return true;
    }
  );
});

test("configured client maps primus code + subCode (50000 + 508) to 20002", async () => {
  const gatewayClient = new FakeGatewayClient();
  const primusAdapter = new FakePrimusAdapter();
  primusAdapter.collectAttestationBundle = async () => {
    throw {
      code: "50000",
      subCode: "508",
      message: "internal algorithm failure"
    };
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "primus-subcode-50000-508",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "20002");
      assert.equal(
        err.message,
        "Internal algorithm error. Please contact support. [P-50000:508]."
      );
      return true;
    }
  );
});

test("configured client maps unknown primus code to 20008 fallback", async () => {
  const gatewayClient = new FakeGatewayClient();
  const primusAdapter = new FakePrimusAdapter();
  primusAdapter.collectAttestationBundle = async () => {
    throw {
      code: "77777",
      message: "unknown zktls failure"
    };
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "primus-unknown-code-fallback",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "20008");
      assert.equal(err.message, "Proof generation failure.");
      return true;
    }
  );
});

test("configured client maps gateway ECONNRESET as network error 30004", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.createProofRequest = async () => {
    const e = new Error("socket hang up");
    (e as Error & { code?: string }).code = "ECONNRESET";
    throw e;
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
        clientRequestId: "gateway-network-econnreset",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30004");
      assert.equal(err.message, "Connection to the prover service unstable.");
      return true;
    }
  );
});

test("configured init maps gateway network errors to thrown 30004", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.getConfig = async () => {
    const e = new Error("fetch failed");
    (e as Error & { code?: string }).code = "ENOTFOUND";
    throw e;
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(async () => client.init({ appId: "brevisListaDAO" }), (err: unknown) => {
    assert.ok(err instanceof BnbZkIdProveError);
    assert.equal((err as BnbZkIdProveError).proveCode, "30004");
    assert.equal((err as BnbZkIdProveError).message, "Connection to the prover service unstable.");
    return true;
  });
});

test("configured client maps primus transport error to 30004", async () => {
  const gatewayClient = new FakeGatewayClient();
  const primusAdapter = new FakePrimusAdapter();
  primusAdapter.collectAttestationBundle = async () => {
    throw new SdkError("Unable to sign Primus attestation request.", "TRANSPORT_ERROR");
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter,
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  await assert.rejects(
    async () =>
      client.prove({
        clientRequestId: "primus-transport-error",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30004");
      assert.equal(err.message, "Connection to the prover service unstable.");
      return true;
    }
  );
});

test("configured client maps whitelist blocked (rc=0,result=false) to 00006", async () => {
  whitelistFetchHandler = () => ({
    rc: 0,
    mc: "SUCCESS",
    msg: "",
    result: false
  });
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
        clientRequestId: "whitelist-blocked",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "00006");
      return true;
    }
  );
});

test("configured client maps whitelist network errors to 30004", async () => {
  whitelistFetchHandler = () => {
    const e = new Error("fetch failed");
    (e as Error & { code?: string }).code = "ENOTFOUND";
    throw e;
  };
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
        clientRequestId: "whitelist-network-error",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: "github_account_age"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30004");
      return true;
    }
  );
});

test("configured client ignores whitelist non-rc0 payload and continues prove flow", async () => {
  whitelistFetchHandler = () => ({
    rc: 1,
    mc: "FAILED",
    msg: "upstream unavailable",
    result: false
  });
  const gatewayClient = new FakeGatewayClient();
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });
  await client.init({ appId: "brevisListaDAO" });

  const result = await client.prove({
    clientRequestId: "whitelist-rc1-continue",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    identityPropertyId: "github_account_age"
  });
  assert.equal(result.status, "on_chain_attested");
});

test("configured client queryProofResult returns attested result with clientRequestId when provided", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  const result = await client.queryProofResult({
    proofRequestId: "proof-request-001",
    clientRequestId: "query-task-001"
  });

  assert.deepEqual(result, {
    status: "on_chain_attested",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    identityPropertyId: "github_account_age",
    proofRequestId: "proof-request-001",
    clientRequestId: "query-task-001"
  });
});

test("configured client queryProofResult omits clientRequestId when not provided", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  const result = await client.queryProofResult({
    proofRequestId: "proof-request-001"
  });

  assert.equal("clientRequestId" in result, false);
});

test("configured client queryProofResult maps pending status to 30002", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.statusResult = {
    ...gatewayClient.statusResult,
    status: "generating"
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.queryProofResult({
        proofRequestId: "proof-request-001",
        clientRequestId: "query-pending"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30002");
      assert.equal(err.clientRequestId, "query-pending");
      return true;
    }
  );
});

test("configured client queryProofResult maps submission_failed to 40000", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.statusResult = {
    ...gatewayClient.statusResult,
    status: "submission_failed"
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.queryProofResult({
        proofRequestId: "proof-request-001"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "40000");
      return true;
    }
  );
});

test("configured client queryProofResult maps network-like errors to 30004", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.getProofRequestStatus = async () => {
    const e = new Error("fetch failed");
    (e as Error & { code?: string }).code = "ENOTFOUND";
    throw e;
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.queryProofResult({
        proofRequestId: "proof-request-001",
        clientRequestId: "query-network"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30004");
      assert.equal(err.clientRequestId, "query-network");
      return true;
    }
  );
});

test("configured client queryProofResult maps framework binding_conflict to 30001", async () => {
  const gatewayClient = new FakeGatewayClient();
  gatewayClient.getProofRequestStatus = async () => {
    throw new SdkError("Gateway proof request query failed.", GATEWAY_API_ERROR_CODE, {
      category: "binding_conflict",
      code: "ALREADY_BOUND",
      message: "already bound"
    });
  };
  const client = createConfiguredBnbZkIdClient({
    gatewayClient,
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.queryProofResult({
        proofRequestId: "proof-request-001"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "30001");
      return true;
    }
  );
});

test("configured client queryProofResult throws 00007 when proofRequestId is empty", async () => {
  const client = createConfiguredBnbZkIdClient({
    gatewayClient: new FakeGatewayClient(),
    primusAdapter: new FakePrimusAdapter(),
    primusTemplateResolver: new FakePrimusTemplateResolver()
  });

  await assert.rejects(
    async () =>
      client.queryProofResult({
        proofRequestId: "   ",
        clientRequestId: "query-empty-proof-request-id"
      }),
    (err: unknown) => {
      assert.ok(err instanceof BnbZkIdProveError);
      assert.equal(err.proveCode, "00007");
      assert.equal(err.message, "proofRequestId is empty.");
      assert.equal(err.clientRequestId, "query-empty-proof-request-id");
      return true;
    }
  );
});
