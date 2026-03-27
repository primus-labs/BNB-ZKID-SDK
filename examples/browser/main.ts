import { Buffer } from "buffer";
import { BnbZkIdClient } from "../../src/client/client.js";
import { INTERNAL_BNB_ZKID_CONFIG } from "../../src/config/internal-config.js";
import type { GatewayCreateProofRequestDebugEvent } from "../../src/gateway/debug.js";

type GlobalWithConfig = typeof globalThis & {
  __BNB_ZKID_CONFIG_URL__?: string;
  __BNB_ZKID_GATEWAY_DEBUG__?: (event: GatewayCreateProofRequestDebugEvent) => void;
  Buffer?: typeof Buffer;
};

if (!(globalThis as GlobalWithConfig).Buffer) {
  (globalThis as GlobalWithConfig).Buffer = Buffer;
}

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
        templateResolver: {
          mode: "static";
          templateIds: Record<string, string>;
        };
      }
    | {
        mode: "sdk";
        templateResolver: {
          mode: "server";
          baseUrl: string;
          resolveTemplatePath: string;
        };
        signer: {
          mode: "server";
          baseUrl: string;
          signPath: string;
        };
      };
}

const runButton = document.querySelector<HTMLButtonElement>("#run-harness");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-log");
const logNode = document.querySelector<HTMLElement>("#log");
const modeSelect = document.querySelector<HTMLSelectElement>("#mode");
const primusSdkFields = document.querySelector<HTMLElement>("#primus-sdk-fields");

if (
  !runButton ||
  !clearButton ||
  !logNode ||
  !modeSelect ||
  !primusSdkFields
) {
  throw new Error("Browser harness UI is incomplete.");
}

const modeSelectElement = modeSelect;
const primusSdkFieldsElement = primusSdkFields;
const logElement = logNode;
let currentBlobUrl: string | undefined;

function resolveBrowserHarnessIdentityPropertyId(): string {
  return modeSelectElement.value === "primus-sdk"
    ? "binanceIdentityPropertyId"
    : "github_account_age";
}

function writeLog(line: string): void {
  logElement.textContent = `${logElement.textContent ?? ""}${line}\n`;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}

function updateModeUi(): void {
  const isPrimusSdkMode = modeSelectElement.value === "primus-sdk";
  primusSdkFieldsElement.hidden = !isPrimusSdkMode;
}

function resolveFixtureUrl(pathname: string): string {
  return new URL(pathname, window.location.href).toString();
}

function buildLiveSdkConfig(): BrowserHarnessConfigFile {
  if (INTERNAL_BNB_ZKID_CONFIG.primus.mode !== "sdk") {
    throw new Error("Embedded config must provide a sdk primus config for browser live mode.");
  }

  if (INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.mode !== "server") {
    throw new Error("Embedded config must provide a server template resolver for browser live mode.");
  }

  if (INTERNAL_BNB_ZKID_CONFIG.primus.signer?.mode !== "server") {
    throw new Error("Embedded config must provide a server signer for browser live mode.");
  }

  return {
    gateway: {
      mode: "fixture",
      configPath: resolveFixtureUrl("./fixtures/gateway-config.json"),
      createProofRequestPath: resolveFixtureUrl("./fixtures/gateway-create-proof-request.json"),
      proofRequestStatusPath: resolveFixtureUrl("./fixtures/gateway-proof-request-status.json")
    },
    primus: {
      mode: "sdk",
      templateResolver: {
        mode: "server",
        baseUrl: INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.baseUrl,
        resolveTemplatePath: INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.resolveTemplatePath
      },
      signer: {
        mode: "server",
        baseUrl: INTERNAL_BNB_ZKID_CONFIG.primus.signer.baseUrl,
        signPath: INTERNAL_BNB_ZKID_CONFIG.primus.signer.signPath
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

(globalThis as GlobalWithConfig).__BNB_ZKID_GATEWAY_DEBUG__ = (
  event: GatewayCreateProofRequestDebugEvent
) => {
  writeLog(`gateway ${event.transport} createProofRequest:`);
  writeLog(JSON.stringify(event.input, null, 2));
};

updateModeUi();
modeSelectElement.addEventListener("change", updateModeUi);

runButton.addEventListener("click", async () => {
  logNode.textContent = "";
  runButton.disabled = true;
  modeSelectElement.disabled = true;

  try {
    (globalThis as GlobalWithConfig).__BNB_ZKID_CONFIG_URL__ = prepareConfigUrl();
    writeLog(`mode: ${modeSelectElement.value}`);
    const client = new BnbZkIdClient();
    const initResult = await client.init({
      appId: "brevisListaDAO"
    });

    writeLog(`init: ${JSON.stringify(initResult)}`);
    if (!initResult.success) {
      return;
    }

    const proveResult = await client.prove(
      {
        clientRequestId: "browser-harness-001",
        userAddress: "0x1234567890abcdef1234567890abcdef12345678",
        identityPropertyId: resolveBrowserHarnessIdentityPropertyId(),
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
    writeLog(`error: ${describeError(error)}`);
  } finally {
    runButton.disabled = false;
    modeSelectElement.disabled = false;
    updateModeUi();
  }
});

clearButton.addEventListener("click", () => {
  logElement.textContent = "";
});
