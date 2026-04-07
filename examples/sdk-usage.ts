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

const initResult = await client.init({
  appId: "listdao"
});

if (!initResult.success) {
  console.error("init failed", initResult.error);
  process.exitCode = 1;
} else {
  const identityPropertyId = initResult.providers[0]?.properties[0]?.id;

  if (!identityPropertyId) {
    throw new Error("No identity property is available for this appId.");
  }

  renderProviderList(initResult.providers);

  try {
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
      console.error("prove failed", error.code, error.message, error.details);
    } else {
      console.error("prove failed", error);
    }
  }
}
