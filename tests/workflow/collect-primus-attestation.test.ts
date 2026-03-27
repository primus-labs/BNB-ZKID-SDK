import assert from "node:assert/strict";
import test from "node:test";
import { collectPrimusAttestationForProveInput } from "../../src/workflow/collect-primus-attestation.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../../src/primus/types.js";

class FakePrimusAdapter implements PrimusZkTlsAdapter {
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

test("workflow forwards prove input into primus additionParams", async () => {
  const adapter = new FakePrimusAdapter();

  await collectPrimusAttestationForProveInput(adapter, {
    templateId: "github-template",
    zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
    proveInput: {
      clientRequestId: "prove-task-001",
      identityPropertyId: "github_account_age",
      provingParams: {
        contribution: [21, 51]
      },
      userAddress: "0x1234567890abcdef1234567890abcdef12345678"
    },
    attConditions: [
      [
        {
          field: "contribution",
          op: ">",
          value: "20"
        }
      ]
    ],
    additionParams: {
      tenantId: "tenant-a"
    }
  });

  assert.deepEqual(adapter.lastInput, {
    templateId: "github-template",
    zktlsAppId: "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    attConditions: [
      [
        {
          field: "contribution",
          op: ">",
          value: "20"
        }
      ]
    ],
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
