import assert from "node:assert/strict";
import test from "node:test";
import { createPrimusZkTlsAdapter } from "../../src/primus/adapter.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttConditions,
  PrimusAttestation,
  PrimusAttestationRequest,
  PrimusInitOptions,
  PrimusGenerateRequestParamsOptions,
  PrimusZkTlsRuntime
} from "../../src/primus/types.js";

class FakeAttRequest implements PrimusAttestationRequest {
  readonly requestid = "primus-request-001";
  private additionParams: string | undefined;
  private attMode: { algorithmType: string; resultType?: string } | undefined;
  private attConditions: PrimusAttConditions | undefined;
  private allJsonResponseFlag: string | undefined;
  private readonly timeout: number | undefined;

  constructor(
    private readonly templateId: string,
    private readonly userAddress: string,
    options?: PrimusGenerateRequestParamsOptions
  ) {
    this.timeout = options?.timeout;
  }

  setAdditionParams(additionParams: string): void {
    this.additionParams = additionParams;
  }

  setAttMode(attMode: { algorithmType: string; resultType?: string }): void {
    this.attMode = attMode;
  }

  setAttConditions(attConditions: PrimusAttConditions): void {
    this.attConditions = attConditions;
  }

  setAllJsonResponseFlag(flag: string): void {
    this.allJsonResponseFlag = flag;
  }

  toJsonString(): string {
    const payload: Record<string, unknown> = {
      appId: "test-app",
      attTemplateID: this.templateId,
      userAddress: this.userAddress,
      requestid: this.requestid,
      attMode: this.attMode,
      attConditions: this.attConditions,
      allJsonResponseFlag: this.allJsonResponseFlag,
      additionParams: this.additionParams
    };
    if (this.timeout !== undefined) {
      payload.timeout = this.timeout;
    }
    return JSON.stringify(payload);
  }
}

class FakePrimusRuntime implements PrimusZkTlsRuntime {
  initCalls: Array<{ appId: string; appSecret?: string; options?: PrimusInitOptions }> = [];
  generatedRequests: FakeAttRequest[] = [];
  signedRequests: string[] = [];
  startedRequests: string[] = [];
  verifyResult = true;

  async init(appId: string, appSecret?: string, options?: PrimusInitOptions): Promise<string | boolean> {
    this.initCalls.push({
      appId,
      ...(appSecret === undefined ? {} : { appSecret }),
      ...(options === undefined ? {} : { options })
    });
    return true;
  }

  generateRequestParams(
    attTemplateID: string,
    userAddress?: string,
    options?: PrimusGenerateRequestParamsOptions
  ): PrimusAttestationRequest {
    const request = new FakeAttRequest(attTemplateID, userAddress ?? "", options);
    this.generatedRequests.push(request);
    return request;
  }

  async sign(signParams: string): Promise<string> {
    this.signedRequests.push(signParams);
    return JSON.stringify({
      attRequest: JSON.parse(signParams),
      appSignature: "signed-by-runtime"
    });
  }

  async startAttestation(attestationParamsStr: string): Promise<PrimusAttestation> {
    this.startedRequests.push(attestationParamsStr);
    const signed = JSON.parse(attestationParamsStr) as { attRequest: { requestid: string } };
    return {
      requestid: signed.attRequest.requestid,
      request: {
        requestid: signed.attRequest.requestid
      },
      recipient: "0x1234567890abcdef1234567890abcdef12345678"
    };
  }

  verifyAttestation(attestation: PrimusAttestation): boolean {
    void attestation;
    return this.verifyResult;
  }

  getPrivateData(requestid: string): unknown {
    if (requestid !== "primus-request-001") {
      return undefined;
    }

    return [
      {
        id: "contribution",
        salt: "salt-001",
        content: ["88"]
      }
    ];
  }
}

test("primus adapter signs, verifies, and collects attestation bundle", async () => {
  const runtime = new FakePrimusRuntime();
  const signerCalls: string[] = [];
  const adapter = createPrimusZkTlsAdapter({
    initOptions: {
      platform: "pc"
    },
    signer: {
      async sign(signParams: string, appId: string): Promise<string> {
        signerCalls.push(signParams);
        assert.equal(appId, "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2");
        return JSON.stringify({
          attRequest: JSON.parse(signParams),
          appSignature: "signed-by-http-signer"
        });
      }
    },
    runtimeFactory: async () => runtime
  });

  const bundle = await adapter.collectAttestationBundle({
    templateId: "github-template",
    zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    timeoutMs: 45_000,
    algorithmType: "proxytls",
    additionParams: {
      clientRequestId: "prove-task-001"
    },
    attConditions: [
      [
        {
          field: "contribution",
          op: ">",
          value: "20"
        }
      ]
    ]
  });

  assert.equal(runtime.initCalls.length, 1);
  assert.deepEqual(runtime.initCalls[0], {
    appId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
  });
  assert.equal(signerCalls.length, 1);
  assert.equal(runtime.startedRequests.length, 1);
  assert.equal(bundle.requestId, "primus-request-001");
  assert.deepEqual(bundle.zkTlsProof.public_data, {
    requestid: "primus-request-001",
    request: {
      requestid: "primus-request-001"
    },
    recipient: "0x1234567890abcdef1234567890abcdef12345678"
  });
  assert.deepEqual(bundle.zkTlsProof.private_data, [
    {
      id: "contribution",
      salt: "salt-001",
      content: ["88"]
    }
  ]);
  assert.deepEqual(bundle.privateData, [
    {
      id: "contribution",
      salt: "salt-001",
      content: ["88"]
    }
  ]);
});

test("primus adapter forwards allJsonResponseFlag when set", async () => {
  const runtime = new FakePrimusRuntime();
  const adapter = createPrimusZkTlsAdapter({
    appId: "test-app",
    appSecret: "test-secret",
    runtimeFactory: async () => runtime
  });

  await adapter.collectAttestationBundle({
    templateId: "github-template",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    allJsonResponseFlag: "false"
  });

  const req = runtime.generatedRequests.at(-1);
  assert.ok(req);
  const parsed = JSON.parse(req.toJsonString()) as { allJsonResponseFlag?: string };
  assert.equal(parsed.allJsonResponseFlag, "false");
});

test("primus adapter rejects invalid allJsonResponseFlag", async () => {
  const runtime = new FakePrimusRuntime();
  const adapter = createPrimusZkTlsAdapter({
    appId: "test-app",
    appSecret: "test-secret",
    runtimeFactory: async () => runtime
  });

  const badInput = {
    templateId: "github-template",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    allJsonResponseFlag: "yes"
  } as unknown as CollectPrimusAttestationInput;

  await assert.rejects(() => adapter.collectAttestationBundle(badInput), /allJsonResponseFlag must be "true" or "false"/);
});

test("primus adapter fails without appSecret or injected signer", async () => {
  const runtime = new FakePrimusRuntime();
  const adapter = createPrimusZkTlsAdapter({
    appId: "test-app",
    runtimeFactory: async () => runtime
  });

  await assert.rejects(
    () =>
      adapter.collectAttestationBundle({
        templateId: "github-template",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678"
      }),
    /Primus signing requires either appSecret or an injected signer/
  );
});

test("primus adapter fails when attestation verification returns false", async () => {
  const runtime = new FakePrimusRuntime();
  runtime.verifyResult = false;

  const adapter = createPrimusZkTlsAdapter({
    appId: "test-app",
    appSecret: "test-secret",
    runtimeFactory: async () => runtime
  });

  await assert.rejects(
    () =>
      adapter.collectAttestationBundle({
        templateId: "github-template",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678"
      }),
    /Primus attestation verification failed/
  );
});
