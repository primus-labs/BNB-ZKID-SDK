import assert from "node:assert/strict";
import test from "node:test";
import { collectPrimusAttestationFromTemplateResolver } from "../../src/workflow/collect-primus-attestation-from-resolver.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../../src/primus/types.js";
import type {
  PrimusTemplateResolver,
  ResolvePrimusAppInput,
  ResolvePrimusAppResult,
  ResolvePrimusTemplateInput,
  ResolvePrimusTemplateResult
} from "../../src/primus/template-resolver.js";

class FakeResolverPrimusAdapter implements PrimusZkTlsAdapter {
  lastInput: CollectPrimusAttestationInput | undefined;

  async init(): Promise<string | boolean> {
    return true;
  }

  async collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle> {
    this.lastInput = input;

    return {
      requestId: "primus-request-001",
      zkTlsProof: {
        public_data: {
          requestid: "primus-request-001"
        },
        private_data: []
      },
      attestation: {
        requestid: "primus-request-001"
      },
      privateData: []
    };
  }
}

class FakeTemplateResolver implements PrimusTemplateResolver {
  readonly calls: ResolvePrimusTemplateInput[] = [];

  async resolveAppConfig(input: ResolvePrimusAppInput): Promise<ResolvePrimusAppResult> {
    void input;

    return {
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    };
  }

  async resolveTemplate(input: ResolvePrimusTemplateInput): Promise<ResolvePrimusTemplateResult> {
    this.calls.push(input);
    return {
      templateId: "github-template",
      zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2"
    };
  }

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    return (await this.resolveTemplate(input)).templateId;
  }
}

test("resolver-based workflow resolves template id before collecting attestation", async () => {
  const adapter = new FakeResolverPrimusAdapter();
  const templateResolver = new FakeTemplateResolver();

  await collectPrimusAttestationFromTemplateResolver(
    adapter,
    templateResolver,
    {
      appId: "brevisListaDAO",
      proveInput: {
        clientRequestId: "prove-task-001",
        identityPropertyId: "github_account_age",
        provingParams: {
          contribution: [21, 51]
        },
        userAddress: "0x1234567890abcdef1234567890abcdef12345678"
      },
      additionParams: {
        tenantId: "tenant-a"
      }
    }
  );

  assert.deepEqual(templateResolver.calls, [
    {
      appId: "brevisListaDAO",
      identityPropertyId: "github_account_age"
    }
  ]);
  assert.deepEqual(adapter.lastInput, {
    templateId: "github-template",
    zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    additionParams: {
      clientRequestId: "prove-task-001",
      identityPropertyId: "github_account_age",
      provingParams: {
        contribution: [21, 51]
      },
      tenantId: "tenant-a"
    }
  });
});

test("resolver-based workflow forwards template API options into primus collect", async () => {
  const adapter = new FakeResolverPrimusAdapter();
  const templateResolver: PrimusTemplateResolver = {
    async resolveAppConfig() {
      return { zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2" };
    },
    async resolveTemplate() {
      return {
        templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
        zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
        allJsonResponseFlag: "true",
        attConditions: [[{ field: "github_id", op: "SHA256_WITH_SALT" }]],
        additionParams: {
          needUpdateRequests: [{ bodyParams: { rows: 100 } }]
        }
      };
    },
    async resolveTemplateId(input) {
      return (await this.resolveTemplate(input)).templateId;
    }
  };

  await collectPrimusAttestationFromTemplateResolver(adapter, templateResolver, {
    appId: "brevisListaDAO",
    proveInput: {
      clientRequestId: "prove-task-002",
      identityPropertyId: "github_account_age",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678"
    }
  });

  assert(adapter.lastInput);
  assert.equal(adapter.lastInput.allJsonResponseFlag, "true");
  assert.deepEqual(adapter.lastInput.attConditions, [
    [{ field: "github_id", op: "SHA256_WITH_SALT" }]
  ]);
  assert.deepEqual(adapter.lastInput.additionParams?.needUpdateRequests, [
    { bodyParams: { rows: 100 } }
  ]);
});
