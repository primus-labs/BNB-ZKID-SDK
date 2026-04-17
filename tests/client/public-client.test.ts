import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BnbZkIdClient } from "../../src/client/client.js";
import type { PrimusAttestationBundle } from "../../src/primus/types.js";

const originalFetch = globalThis.fetch;

test.beforeEach(() => {
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
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rc: 0,
          mc: "SUCCESS",
          msg: "",
          result: true
        })
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
                schemaVersion: "1.0.0",
                businessParams: {
                  contribution: [21, 51]
                }
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
        error: null
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

  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId: "github_account_age"
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
  assert.deepEqual(proveResult, {
    status: "on_chain_attested",
    clientRequestId: "prove-task-001",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    identityPropertyId: "github_account_age",
    proofRequestId: "proof-request-001"
  });

  const queryResult = await client.queryProofResult({
    proofRequestId: "proof-request-001",
    clientRequestId: "query-task-001"
  });
  assert.deepEqual(queryResult, {
    status: "on_chain_attested",
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    providerId: "github",
    identityPropertyId: "github_account_age",
    proofRequestId: "proof-request-001",
    clientRequestId: "query-task-001"
  });

  delete process.env.BNB_ZKID_CONFIG_PATH;
});
