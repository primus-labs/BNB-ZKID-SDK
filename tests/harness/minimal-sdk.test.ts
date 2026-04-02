import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { createHarnessClient } from "../../src/harness/create-harness-client.js";

const execFileAsync = promisify(execFile);

test("deterministic harness returns a typed happy path", async () => {
  const client = await createHarnessClient();
  const events: string[] = [];

  const initResult = await client.init({ appId: "listdao" });
  assert.equal(initResult.success, true);
  if (initResult.success) {
    assert.deepEqual(initResult.providers[0]?.id, "github");
    assert.deepEqual(
      initResult.providers[0]?.properties[0]?.businessParams,
      {
        contribution: [21, 51]
      }
    );
  }

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
  assert.equal(proveResult.status, "on_chain_attested");

  if (proveResult.status !== "on_chain_attested") {
    assert.fail("expected on_chain_attested result");
  }

  assert.equal(proveResult.providerId, "github");
  assert.equal(proveResult.identityPropertyId, "github_account_age");
  assert.equal(
    proveResult.walletAddress,
    "0x1234567890abcdef1234567890abcdef12345678"
  );
});

test("minimal example executes successfully after build", async () => {
  const examplePath = fileURLToPath(new URL("../../examples/minimal.js", import.meta.url));
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const { stdout, stderr } = await execFileAsync(process.execPath, [examplePath], {
    cwd
  });

  assert.equal(stderr, "");
  assert.match(stdout, /progress initializing/);
  assert.match(stdout, /result on_chain_attested/);
});
