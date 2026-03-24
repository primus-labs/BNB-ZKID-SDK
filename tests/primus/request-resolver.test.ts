import assert from "node:assert/strict";
import test from "node:test";
import {
  createTieredThresholdAttConditions,
  resolvePrimusCollectInputForProve
} from "../../src/primus/request-resolver.js";

test("createTieredThresholdAttConditions builds tier-aligned condition groups", () => {
  const attConditions = createTieredThresholdAttConditions(
    {
      contribution: [21, 51]
    },
    {
      contribution: {
        op: ">",
        encodeValue: (threshold) => String(threshold - 1)
      }
    }
  );

  assert.deepEqual(attConditions, [
    [
      {
        field: "contribution",
        op: ">",
        value: "20"
      }
    ],
    [
      {
        field: "contribution",
        op: ">",
        value: "50"
      }
    ]
  ]);
});

test("resolvePrimusCollectInputForProve resolves github_account_age into template and conditions", () => {
  const collectInput = resolvePrimusCollectInputForProve(
    {
      github_account_age: {
        templateId: "github-template",
        fieldRules: {
          contribution: {
            op: ">",
            encodeValue: (threshold) => String(threshold - 1)
          }
        }
      }
    },
    {
      proveInput: {
        clientRequestId: "prove-task-001",
        provingDataId: "github_account_age",
        provingParams: {
          contribution: [21, 51]
        },
        userAddress: "0x1234567890abcdef1234567890abcdef12345678"
      }
    }
  );

  assert.deepEqual(collectInput, {
    templateId: "github-template",
    userAddress: "0x1234567890abcdef1234567890abcdef12345678",
    attConditions: [
      [
        {
          field: "contribution",
          op: ">",
          value: "20"
        }
      ],
      [
        {
          field: "contribution",
          op: ">",
          value: "50"
        }
      ]
    ],
    additionParams: {
      clientRequestId: "prove-task-001",
      provingDataId: "github_account_age",
      provingParams: {
        contribution: [21, 51]
      }
    }
  });
});

test("resolvePrimusCollectInputForProve fails for unmapped provingDataId", () => {
  assert.throws(
    () =>
      resolvePrimusCollectInputForProve(
        {},
        {
          proveInput: {
            clientRequestId: "prove-task-001",
            provingDataId: "unknown_data_id",
            userAddress: "0x1234567890abcdef1234567890abcdef12345678"
          }
        }
      ),
    /No Primus proving-data mapping found/
  );
});
