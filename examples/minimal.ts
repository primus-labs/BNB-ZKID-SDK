import { BnbZkIdProveError } from "../src/errors/prove-error.js";
import { createHarnessClient } from "../src/harness/create-harness-client.js";
import type { ProveProgressEvent } from "../src/types/public.js";

const client = await createHarnessClient();
const progress: ProveProgressEvent[] = [];

try {
  const initResult = await client.init({
    appId: "listdao"
  });
  console.log("init", initResult.success);
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
        progress.push(event);
        console.log("progress", event.status, event.proofRequestId ?? "pending");
      }
    }
  );

  console.log("result", proveResult.status);
  console.log(
    "attested",
    proveResult.walletAddress,
    proveResult.providerId,
    proveResult.identityPropertyId
  );

  if (progress.length === 0) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error("sdk failed", error.toJSON());
  } else {
    console.error("sdk failed", error);
  }
  process.exitCode = 1;
}
