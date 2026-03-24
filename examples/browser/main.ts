import { BnbZkIdClient } from "../../src/client/client.js";

type GlobalWithConfig = typeof globalThis & {
  __BNB_ZKID_CONFIG_URL__?: string;
};

interface BrowserHarnessConfigFile {
  gateway:
    | {
        mode: "fixture";
        configPath: string;
        createProofRequestPath: string;
        proofRequestStatusPath: string;
      }
    | {
        mode: "http";
        baseUrl: string;
      };
  primus:
    | {
        mode: "fixture";
        bundlePath: string;
      }
    | {
        mode: "sdk";
        zktlsAppId: string;
        appSecret: string;
      };
  provingDataRegistry: Record<
    string,
    {
      templateId: string;
      algorithmType: "proxytls" | "mpctls";
      fieldRules?: Record<
        string,
        {
          op: string;
          valueOffset?: number;
        }
      >;
    }
  >;
}

const runButton = document.querySelector<HTMLButtonElement>("#run-harness");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-log");
const logNode = document.querySelector<HTMLElement>("#log");
const modeSelect = document.querySelector<HTMLSelectElement>("#mode");
const primusSdkFields = document.querySelector<HTMLElement>("#primus-sdk-fields");
const zktlsAppIdInput = document.querySelector<HTMLInputElement>("#zktls-app-id");
const appSecretInput = document.querySelector<HTMLInputElement>("#app-secret");

if (
  !runButton ||
  !clearButton ||
  !logNode ||
  !modeSelect ||
  !primusSdkFields ||
  !zktlsAppIdInput ||
  !appSecretInput
) {
  throw new Error("Browser harness UI is incomplete.");
}

const modeSelectElement = modeSelect;
const primusSdkFieldsElement = primusSdkFields;
const zktlsAppIdInputElement = zktlsAppIdInput;
const appSecretInputElement = appSecretInput;
const logElement = logNode;
let currentBlobUrl: string | undefined;

function writeLog(line: string): void {
  logElement.textContent = `${logElement.textContent ?? ""}${line}\n`;
}

function updateModeUi(): void {
  const isPrimusSdkMode = modeSelectElement.value === "primus-sdk";
  primusSdkFieldsElement.hidden = !isPrimusSdkMode;
  zktlsAppIdInputElement.disabled = !isPrimusSdkMode;
  appSecretInputElement.disabled = !isPrimusSdkMode;
}

function buildLiveSdkConfig(): BrowserHarnessConfigFile {
  const zktlsAppId = zktlsAppIdInputElement.value.trim();
  const appSecret = appSecretInputElement.value.trim();
  if (zktlsAppId.length === 0) {
    throw new Error("Live mode requires zktlsAppId.");
  }

  if (appSecret.length === 0) {
    throw new Error("Live mode requires appSecret.");
  }

  return {
    gateway: {
      mode: "fixture",
      configPath: "./fixtures/gateway-config.json",
      createProofRequestPath: "./fixtures/gateway-create-proof-request.json",
      proofRequestStatusPath: "./fixtures/gateway-proof-request-status.json"
    },
    primus: {
      mode: "sdk",
      zktlsAppId,
      appSecret
    },
    provingDataRegistry: {
      github_account_age: {
        templateId: "github-template",
        algorithmType: "proxytls",
        fieldRules: {
          contribution: {
            op: ">",
            valueOffset: -1
          }
        }
      }
    }
  };
}

function prepareConfigUrl(): string {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = undefined;
  }

  if (modeSelectElement.value === "fixture") {
    return "./bnb-zkid.config.json";
  }

  const config = buildLiveSdkConfig();
  currentBlobUrl = URL.createObjectURL(
    new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
  );
  return currentBlobUrl;
}

updateModeUi();
modeSelectElement.addEventListener("change", updateModeUi);

runButton.addEventListener("click", async () => {
  logNode.textContent = "";
  runButton.disabled = true;
  modeSelectElement.disabled = true;
  zktlsAppIdInputElement.disabled = true;
  appSecretInputElement.disabled = true;

  try {
    (globalThis as GlobalWithConfig).__BNB_ZKID_CONFIG_URL__ = prepareConfigUrl();
    writeLog(`mode: ${modeSelectElement.value}`);
    const client = new BnbZkIdClient();
    const initResult = await client.init({
      appId: "listdao"
    });

    writeLog(`init: ${JSON.stringify(initResult)}`);
    if (!initResult.success) {
      return;
    }

    const proveResult = await client.prove(
      {
        clientRequestId: "browser-harness-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        provingDataId: "github_account_age",
        provingParams: {
          contribution: [21, 51]
        }
      },
      {
        onProgress(event) {
          writeLog(`progress: ${event.status} ${event.proofRequestId ?? ""}`.trim());
        }
      }
    );

    writeLog(`prove: ${JSON.stringify(proveResult, null, 2)}`);
  } catch (error) {
    writeLog(
      `error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
    );
  } finally {
    runButton.disabled = false;
    modeSelectElement.disabled = false;
    updateModeUi();
  }
});

clearButton.addEventListener("click", () => {
  logElement.textContent = "";
});
