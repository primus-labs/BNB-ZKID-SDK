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
    proveInput: {
      clientRequestId: "prove-task-001",
      provingDataId: "github_account_age",
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
      provingDataId: "github_account_age",
      provingParams: {
        contribution: [21, 51]
      },
      tenantId: "tenant-a"
    }
  });
});
