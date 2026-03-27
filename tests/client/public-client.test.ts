import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BnbZkIdClient } from "../../src/client/client.js";
import type { PrimusAttestationBundle } from "../../src/primus/types.js";

async function createTempConfig(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bnb-zkid-public-client-"));

  await writeFile(
    path.join(dir, "config.json"),
    JSON.stringify(
      {
        gateway: {
          mode: "fixture",
          configPath: "./gateway-config.json",
          createProofRequestPath: "./gateway-create-proof-request.json",
          proofRequestStatusPath: "./gateway-proof-request-status.json"
        },
        primus: {
          mode: "fixture",
          bundlePath: "./primus-bundle.json",
          templateResolver: {
            mode: "static",
            templateIds: {
              github_account_age: "github-template"
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(dir, "gateway-config.json"),
    JSON.stringify(
      {
        appIds: ["brevisListaDAO"],
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
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(dir, "gateway-create-proof-request.json"),
    JSON.stringify(
      {
        proofRequestId: "proof-request-001",
        status: "initialized",
        providerId: "github",
        identityPropertyId: "github_account_age"
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    path.join(dir, "gateway-proof-request-status.json"),
    JSON.stringify(
      {
        proofRequestId: "proof-request-001",
        status: "on_chain_attested",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        providerId: "github",
        identityPropertyId: "github_account_age"
      },
      null,
      2
    ),
    "utf8"
  );

  const bundle: PrimusAttestationBundle = {
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

  await writeFile(path.join(dir, "primus-bundle.json"), JSON.stringify(bundle, null, 2), "utf8");

  return path.join(dir, "config.json");
}

test("public BnbZkIdClient loads config file and executes prove workflow", async () => {
  const configPath = await createTempConfig();
  process.env.BNB_ZKID_CONFIG_PATH = configPath;

  const client = new BnbZkIdClient();
  const events: string[] = [];

  const initResult = await client.init({
    appId: "brevisListaDAO"
  });
  assert.deepEqual(initResult, {
    success: true
  });

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
  assert.deepEqual(proveResult, {
    status: "on_chain_attested",
    clientRequestId: "prove-task-001",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    identityPropertyId: "github_account_age",
    proofRequestId: "proof-request-001"
  });

  delete process.env.BNB_ZKID_CONFIG_PATH;
});
