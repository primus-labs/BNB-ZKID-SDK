import {
  BnbZkIdClient,
  BnbZkIdProveError,
  type BnbZkIdGatewayConfigProviderWire
} from "../src/index.js";

function renderProviderList(providers: BnbZkIdGatewayConfigProviderWire[]): void {
  console.log(
    "providers",
    providers.map((provider) => ({
      id: provider.id,
      properties: provider.properties.map((property) => property.id)
    }))
  );
}

const client = new BnbZkIdClient();
try {
  const initResult = await client.init({
    appId: "listdao"
  });

  const identityPropertyId = initResult.providers[0]?.properties[0]?.id;

  if (!identityPropertyId) {
    throw new Error("No identity property is available for this appId.");
  }

  renderProviderList(initResult.providers);

  const proveResult = await client.prove(
    {
      clientRequestId: "prove-task-001",
      userAddress: "0x1234567890abcdef1234567890abcdef12345678",
      identityPropertyId
    },
    {
      onProgress(event) {
        console.log("progress", event.status, event.proofRequestId ?? "pending");
      }
    }
  );

  console.log("result", proveResult.status, proveResult.walletAddress);
} catch (error) {
  if (error instanceof BnbZkIdProveError) {
    console.error("sdk failed", error.code, error.message);
  } else {
    console.error("sdk failed", error);
  }
  process.exitCode = 1;
}
