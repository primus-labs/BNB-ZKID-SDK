import { createHarnessClient } from "../src/harness/create-harness-client.js";
import type { ProveProgressEvent } from "../src/types/public.js";

const client = await createHarnessClient();

const initResult = await client.init({
  appId: "listdao"
});

if (!initResult.success) {
  console.error("init failed", initResult.error);
  process.exitCode = 1;
} else {
  const progress: ProveProgressEvent[] = [];

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
        progress.push(event);
        console.log("progress", event.status, event.proofRequestId ?? "pending");
      }
    }
  );

  console.log("result", proveResult.status);
  if (proveResult.status === "on_chain_attested") {
    console.log(
      "attested",
      proveResult.walletAddress,
      proveResult.providerId,
      proveResult.identityPropertyId
    );
  }

  if (progress.length === 0) {
    process.exitCode = 1;
  }
}
