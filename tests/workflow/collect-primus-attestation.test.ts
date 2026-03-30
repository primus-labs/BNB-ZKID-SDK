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

test("workflow applies resolver-provided template defaults (resolvedPrimusTemplateOptions)", async () => {
  const adapter = new FakePrimusAdapter();

  await collectPrimusAttestationForProveInput(adapter, {
    templateId: "21701f5e-c90c-40a4-8ced-bc1696828f11",
    proveInput: {
      clientRequestId: "prove-task-002",
      identityPropertyId: "github_account_age",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678"
    },
    resolvedPrimusTemplateOptions: {
      allJsonResponseFlag: "true",
      attConditions: [
        [{ field: "github_id", op: "SHA256_WITH_SALT" }],
        [
          { field: "contribution", op: "SHA256_WITH_SALT" },
          { field: "years", op: "SHA256_WITH_SALT" },
          { field: "github_id_in_html", op: "SHA256_WITH_SALT" }
        ]
      ]
    }
  });

  assert(adapter.lastInput);
  assert.equal(adapter.lastInput.allJsonResponseFlag, "true");
  const firstGroup = adapter.lastInput.attConditions?.[0];
  const firstCond = firstGroup?.[0];
  assert.ok(firstCond);
  assert.equal(firstCond.field, "github_id");
});
