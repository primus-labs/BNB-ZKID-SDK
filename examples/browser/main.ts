/// <reference types="vite/client" />
import { Buffer } from "buffer";
import { BnbZkIdClient } from "../../src/client/client.js";
import { INTERNAL_BNB_ZKID_CONFIG } from "../../src/config/internal-config.js";
import { cloneGatewayBusinessParamsForRequest } from "../../src/gateway/business-params.js";
import type { GatewayCreateProofRequestDebugEvent } from "../../src/gateway/debug.js";
import type { ProveInput } from "../../src/types/public.js";

type GlobalWithConfig = typeof globalThis & {
  __BNB_ZKID_CONFIG_URL__?: string;
  __BNB_ZKID_GATEWAY_DEBUG__?: (event: GatewayCreateProofRequestDebugEvent) => void;
  Buffer?: typeof Buffer;
};

if (!(globalThis as GlobalWithConfig).Buffer) {
  (globalThis as GlobalWithConfig).Buffer = Buffer;
}

/** Brevis Gateway origin (browser will call `GET ${base}/v1/config` etc.). */
const BREVIS_GATEWAY_DIRECT_URL = "http://44.226.158.196:8038";

/**
 * When `true` and `npm run dev:browser-harness`, Gateway + PADO calls use same-origin
 * `/brevis-gateway/` and `/pado-api/` (Vite proxy). When `false`, browser hits
 * {@link BREVIS_GATEWAY_DIRECT_URL} / api-dev.padolabs.org directly (needs CORS on those hosts).
 */
const BREVIS_GATEWAY_USE_DEV_PROXY = true;

function resolveBrevisGatewayBaseUrl(): string {
  if (import.meta.env.DEV && BREVIS_GATEWAY_USE_DEV_PROXY) {
    return new URL("/brevis-gateway/", window.location.origin).href;
  }
  return BREVIS_GATEWAY_DIRECT_URL;
}

/** In dev + proxy mode, PADO templates/signer go through `/pado-api/` → api-dev.padolabs.org. */
function resolvePadolabsBaseUrlForDev(original: string): string {
  if (!import.meta.env.DEV || !BREVIS_GATEWAY_USE_DEV_PROXY) {
    return original;
  }
  try {
    if (new URL(original).origin === "https://api-dev.padolabs.org") {
      return new URL("/pado-api/", window.location.origin).href;
    }
  } catch {
    /* ignore */
  }
  return original;
}

/**
 * One row per `providers[].properties[]` entry from `./fixtures/config.json`
 * (same payload as BrevisFixture Gateway `GET /v1/config`).
 */
interface BrevisHarnessRow {
  providerId: string;
  providerDescription: string;
  identityPropertyId: string;
  propertyDescription: string;
  businessParams?: Record<string, unknown>;
}

const brevisHarnessCatalog: BrevisHarnessRow[] = [];
let brevisHarnessCatalogLoaded = false;

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
const brevisProviderSelect = document.querySelector<HTMLSelectElement>("#brevis-provider");
const primusSdkFields = document.querySelector<HTMLElement>("#primus-sdk-fields");

if (
  !runButton ||
  !clearButton ||
  !logNode ||
  !modeSelect ||
  !brevisProviderSelect ||
  !primusSdkFields
) {
  throw new Error("Browser harness UI is incomplete.");
}

const modeSelectElement = modeSelect;
const brevisProviderSelectElement = brevisProviderSelect;
const primusSdkFieldsElement = primusSdkFields;
const logElement = logNode;
let currentBlobUrl: string | undefined;

function rebuildBrevisProviderSelect(): void {
  brevisProviderSelectElement.replaceChildren();
  for (const row of brevisHarnessCatalog) {
    const opt = document.createElement("option");
    opt.value = row.identityPropertyId;
    opt.textContent = `${row.providerDescription} · ${row.propertyDescription}`;
    opt.title = `${row.propertyDescription} (${row.identityPropertyId})`;
    brevisProviderSelectElement.appendChild(opt);
  }
}

async function loadBrevisHarnessCatalog(): Promise<void> {
  const url = resolveFixtureUrl("./fixtures/config.json");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} loading ${url}`);
  }
  const data = (await res.json()) as {
    providers: Array<{
      id: string;
      description: string;
      properties: Array<{
        id: string;
        description: string;
        businessParams?: Record<string, unknown>;
      }>;
    }>;
  };
  brevisHarnessCatalog.length = 0;
  for (const prov of data.providers) {
    for (const prop of prov.properties) {
      brevisHarnessCatalog.push({
        providerId: prov.id,
        providerDescription: prov.description,
        identityPropertyId: prop.id,
        propertyDescription: prop.description,
        ...(prop.businessParams !== undefined ? { businessParams: prop.businessParams } : {})
      });
    }
  }
  brevisHarnessCatalogLoaded = true;
  rebuildBrevisProviderSelect();
}

function getSelectedBrevisRow(): BrevisHarnessRow | undefined {
  return brevisHarnessCatalog.find(
    (row) => row.identityPropertyId === brevisProviderSelectElement.value
  );
}

function harnessUsesBrevisProviderPicker(): boolean {
  return (
    modeSelectElement.value === "primus-sdk" ||
    modeSelectElement.value === "fixture-brevis-gateway-primus-sdk"
  );
}

function resolveBrowserHarnessIdentityPropertyId(): string {
  if (modeSelectElement.value === "fixture") {
    return "github_account_age";
  }
  const selected = getSelectedBrevisRow();
  const fallback = brevisHarnessCatalog[0]?.identityPropertyId;
  if (selected?.identityPropertyId) {
    return selected.identityPropertyId;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error("Brevis provider catalog is empty; fixtures/config.json failed to load.");
}

function resolveBrowserHarnessProvingParams(): ProveInput["provingParams"] {
  if (modeSelectElement.value === "fixture") {
    return undefined;
  }
  return cloneGatewayBusinessParamsForRequest(getSelectedBrevisRow()?.businessParams);
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
  const showBrevisPrimusHarnessFields = harnessUsesBrevisProviderPicker();
  primusSdkFieldsElement.hidden = !showBrevisPrimusHarnessFields;
  brevisProviderSelectElement.disabled =
    !showBrevisPrimusHarnessFields || !brevisHarnessCatalogLoaded;
}

function resolveFixtureUrl(pathname: string): string {
  return new URL(pathname, window.location.href).toString();
}

function buildLivePrimusSdkBlock(): BrowserHarnessConfigFile["primus"] {
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
    mode: "sdk",
    templateResolver: {
      mode: "server",
      baseUrl: resolvePadolabsBaseUrlForDev(INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.baseUrl),
      resolveTemplatePath: INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.resolveTemplatePath
    },
    signer: {
      mode: "server",
      baseUrl: resolvePadolabsBaseUrlForDev(INTERNAL_BNB_ZKID_CONFIG.primus.signer.baseUrl),
      signPath: INTERNAL_BNB_ZKID_CONFIG.primus.signer.signPath
    }
  };
}

function buildLiveSdkConfig(): BrowserHarnessConfigFile {
  return {
    gateway: {
      mode: "http",
      baseUrl: resolveBrevisGatewayBaseUrl()
    },
    primus: buildLivePrimusSdkBlock()
  };
}

/** Gateway 三接口与 Brevis 对齐的静态 JSON（`/v1/config`、`POST/GET /v1/proof-requests`）；`/v1/config` 与页面 `./fixtures/config.json` 为同一份。Primus 仍走真实 SDK + PADO。 */
function buildBrevisFixtureGatewayWithLivePrimusConfig(): BrowserHarnessConfigFile {
  return {
    gateway: {
      mode: "fixture",
      configPath: resolveFixtureUrl("./fixtures/config.json"),
      createProofRequestPath: resolveFixtureUrl("./fixtures/brevis-v1-proof-requests-post.json"),
      proofRequestStatusPath: resolveFixtureUrl("./fixtures/brevis-v1-proof-requests-get.json")
    },
    primus: buildLivePrimusSdkBlock()
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

  if (modeSelectElement.value === "fixture-brevis-gateway-primus-sdk") {
    const config = buildBrevisFixtureGatewayWithLivePrimusConfig();
    currentBlobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    );
    return currentBlobUrl;
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

void loadBrevisHarnessCatalog()
  .catch((err) => {
    writeLog(
      `Brevis harness: failed to load fixtures/config.json for provider list — ${describeError(err)}`
    );
  })
  .finally(() => {
    updateModeUi();
  });

runButton.addEventListener("click", async () => {
  logNode.textContent = "";
  runButton.disabled = true;
  modeSelectElement.disabled = true;
  brevisProviderSelectElement.disabled = true;

  try {
    if (
      harnessUsesBrevisProviderPicker() &&
      (!brevisHarnessCatalogLoaded || brevisHarnessCatalog.length === 0)
    ) {
      writeLog(
        "Select a mode that needs the Brevis provider list only after fixtures/config.json has loaded (see log above if load failed)."
      );
      return;
    }
    (globalThis as GlobalWithConfig).__BNB_ZKID_CONFIG_URL__ = prepareConfigUrl();
    writeLog(`mode: ${modeSelectElement.value}`);
    if (harnessUsesBrevisProviderPicker()) {
      const row = getSelectedBrevisRow();
      writeLog(
        `provider: ${row?.providerDescription ?? ""} — ${row?.propertyDescription ?? ""} (${row?.identityPropertyId ?? ""})`
      );
      const pp = resolveBrowserHarnessProvingParams();
      writeLog(
        `prove.provingParams (from GET /v1/config properties[].businessParams): ${pp === undefined ? "(omit)" : JSON.stringify(pp)}`
      );
    }
    const client = new BnbZkIdClient();
    const initResult = await client.init({
      appId: "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C" // TODO
    });

    writeLog(`init: ${JSON.stringify(initResult)}`);
    if (!initResult.success) {
      return;
    }

    const provingParams = resolveBrowserHarnessProvingParams();
    const proveInput: ProveInput = {
      clientRequestId: "browser-harness-001",
      userAddress: "0xB12a1f7035FdCBB4cC5Fa102C01346BD45439Adf",// binance steam
      // userAddress: "0x8F0D4188307496926d785fB00E08Ed772f3be890",// okx amazon
      identityPropertyId: resolveBrowserHarnessIdentityPropertyId(),
      ...(provingParams === undefined ? {} : { provingParams })
    };

    const proveResult = await client.prove(
      proveInput,
      {
        onProgress(event) {
          writeLog(`progress: ${event.status} ${event.proofRequestId ?? ""}`.trim());
        }
      }
    );
    console.log("proveResult==:", proveResult);

    writeLog(`prove: ${JSON.stringify(proveResult, null, 2)}`);
  } catch (error) {
    writeLog(`error: ${describeError(error)}`);
  } finally {
    runButton.disabled = false;
    modeSelectElement.disabled = false;
    updateModeUi();
    brevisProviderSelectElement.disabled = !harnessUsesBrevisProviderPicker();
  }
});

clearButton.addEventListener("click", () => {
  logElement.textContent = "";
});
