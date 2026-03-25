import assert from "node:assert/strict";
import test from "node:test";
import { collectPrimusAttestationFromTemplateResolver } from "../../src/workflow/collect-primus-attestation-from-resolver.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../../src/primus/types.js";
import type { PrimusTemplateResolver, ResolvePrimusTemplateInput } from "../../src/primus/template-resolver.js";

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

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    this.calls.push(input);
    return "github-template";
  }
}

test("resolver-based workflow resolves template id before collecting attestation", async () => {
  const adapter = new FakeResolverPrimusAdapter();
  const templateResolver = new FakeTemplateResolver();

  await collectPrimusAttestationFromTemplateResolver(
    adapter,
    templateResolver,
    {
      appId: "listdao",
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
      appId: "listdao",
      identityPropertyId: "github_account_age"
    }
  ]);
  assert.deepEqual(adapter.lastInput, {
    templateId: "github-template",
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
