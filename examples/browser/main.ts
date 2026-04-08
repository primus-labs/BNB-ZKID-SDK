/// <reference types="vite/client" />
import { Buffer } from "buffer";
import { BnbZkIdClient } from "../../src/client/client.js";
import { BnbZkIdProveError } from "../../src/errors/prove-error.js";
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
const BREVIS_GATEWAY_DIRECT_URL = "https://zk-id.brevis.network";

/**
 * Chain-level app id (PADO templates bucket / Brevis app). Same value for live init and
 * browser fixtures so Gateway init and proof-status payloads stay aligned.
 */
const BROWSER_HARNESS_APP_ID =
  "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C";

/** GitHub on-chain property id (Brevis `properties[].id`) for full fixture mode. */
const BROWSER_HARNESS_FIXTURE_GITHUB_PROPERTY_ID =
  "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff";

function resolveBrevisGatewayBaseUrl(): string {
  return BREVIS_GATEWAY_DIRECT_URL;
}

/**
 * One row per Brevis `GET /v1/config` wire entry (`providers[].properties[]`).
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

interface BrowserHarnessConfigOverrideFile {
  gateway?: {
    mode?: "fixture" | "http";
    baseUrl?: string;
    configPath?: string;
    createProofRequestPath?: string;
    proofRequestStatusPath?: string;
  };
  primus?: {
    mode?: "fixture" | "sdk";
    bundlePath?: string;
    templateResolver?: {
      mode?: "static" | "server";
      templateIds?: Record<string, string>;
      baseUrl?: string;
      resolveTemplatePath?: string;
    };
    signer?: {
      mode?: "server";
      baseUrl?: string;
      signPath?: string;
    };
  };
}

const runButton = document.querySelector<HTMLButtonElement>("#run-harness");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-log");
const logNode = document.querySelector<HTMLElement>("#log");
const jsonDetailModal = document.querySelector<HTMLDivElement>("#json-detail-modal");
const jsonDetailTitle = document.querySelector<HTMLElement>("#json-detail-title");
const jsonDetailBody = document.querySelector<HTMLPreElement>("#json-detail-body");
const jsonDetailCopyButton = document.querySelector<HTMLButtonElement>("#json-detail-copy");
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

if (!jsonDetailModal || !jsonDetailTitle || !jsonDetailBody || !jsonDetailCopyButton) {
  throw new Error("Browser harness JSON detail modal is missing.");
}

const jsonDetailModalEl = jsonDetailModal;
const jsonDetailTitleEl = jsonDetailTitle;
const jsonDetailBodyEl = jsonDetailBody;
const jsonDetailCopyButtonEl = jsonDetailCopyButton;

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

/** Fills {@link brevisHarnessCatalog} from Brevis wire JSON (`providers[].properties[]`). */
function populateBrevisHarnessCatalogFromWirePayload(data: unknown): void {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid /v1/config: body is not an object.");
  }
  const root = data as Record<string, unknown>;
  if (root.error != null) {
    throw new Error(`Gateway /v1/config returned error: ${JSON.stringify(root.error)}`);
  }
  if (!Array.isArray(root.providers)) {
    throw new Error("Invalid /v1/config: missing providers array.");
  }

  brevisHarnessCatalog.length = 0;

  for (const provRaw of root.providers) {
    if (typeof provRaw !== "object" || provRaw === null) {
      continue;
    }
    const prov = provRaw as Record<string, unknown>;
    const providerId = typeof prov.id === "string" ? prov.id : "";
    const providerDescription =
      typeof prov.description === "string" && prov.description.trim() !== ""
        ? prov.description.trim()
        : providerId;
    if (!Array.isArray(prov.properties)) {
      continue;
    }

    for (const propRaw of prov.properties) {
      if (typeof propRaw !== "object" || propRaw === null) {
        continue;
      }
      const prop = propRaw as Record<string, unknown>;
      const identityPropertyId = typeof prop.id === "string" ? prop.id.trim() : "";
      if (identityPropertyId === "") {
        continue;
      }
      const propertyDescription =
        typeof prop.description === "string" && prop.description.trim() !== ""
          ? prop.description.trim()
          : identityPropertyId;

      let businessParams: Record<string, unknown> | undefined;
      if (
        prop.businessParams !== undefined &&
        typeof prop.businessParams === "object" &&
        prop.businessParams !== null &&
        !Array.isArray(prop.businessParams)
      ) {
        businessParams = prop.businessParams as Record<string, unknown>;
      }

      brevisHarnessCatalog.push({
        providerId,
        providerDescription,
        identityPropertyId,
        propertyDescription,
        ...(businessParams !== undefined ? { businessParams } : {})
      });
    }
  }
}

async function loadBrevisHarnessCatalogFromFixture(): Promise<void> {
  const url = resolveFixtureUrl("./fixtures/config.json");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} loading ${url}`);
  }
  const data: unknown = await res.json();
  populateBrevisHarnessCatalogFromWirePayload(data);
}

/** Live catalog from `GET {gatewayBase}v1/config` (same base as {@link resolveBrevisGatewayBaseUrl}). */
async function loadBrevisHarnessCatalogFromGateway(): Promise<void> {
  const base = resolveBrevisGatewayBaseUrl();
  const configUrl = new URL("v1/config", base).toString();
  const res = await fetch(configUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from GET ${configUrl}`);
  }
  const data: unknown = await res.json();
  populateBrevisHarnessCatalogFromWirePayload(data);
}

async function refreshBrevisHarnessCatalog(): Promise<void> {
  brevisHarnessCatalogLoaded = false;
  updateModeUi();

  try {
    if (!harnessUsesBrevisProviderPicker()) {
      brevisHarnessCatalog.length = 0;
      rebuildBrevisProviderSelect();
      brevisHarnessCatalogLoaded = true;
      return;
    }

    if (modeSelectElement.value === "fixture-brevis-gateway-primus-sdk") {
      await loadBrevisHarnessCatalogFromFixture();
    } else {
      await loadBrevisHarnessCatalogFromGateway();
    }
    brevisHarnessCatalogLoaded = true;
    rebuildBrevisProviderSelect();
  } catch (err) {
    brevisHarnessCatalog.length = 0;
    brevisHarnessCatalogLoaded = true;
    rebuildBrevisProviderSelect();
    const corsHint =
      modeSelectElement.value === "primus-sdk"
        ? "Browser calls Gateway directly. If GET /v1/config is blocked, ensure the server returns CORS headers such as `Access-Control-Allow-Origin`."
        : "";
    writeLog(
      `Failed to load Brevis provider options - ${describeError(err)}${corsHint ? ` ${corsHint}` : ""}`
    );
  } finally {
    updateModeUi();
  }
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
    return BROWSER_HARNESS_FIXTURE_GITHUB_PROPERTY_ID;
  }
  const selected = getSelectedBrevisRow();
  const fallback = brevisHarnessCatalog[0]?.identityPropertyId;
  if (selected?.identityPropertyId) {
    return selected.identityPropertyId;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(
    "Brevis provider catalog is empty; check GET /v1/config (or fixtures in fixture mode) and log above."
  );
}

function resolveBrowserHarnessProvingParams(): ProveInput["provingParams"] {
  if (modeSelectElement.value === "fixture") {
    return undefined;
  }
  const businessParams = cloneGatewayBusinessParamsForRequest(getSelectedBrevisRow()?.businessParams);
  return businessParams === undefined ? undefined : { businessParams };
}

function writeLog(line: string): void {
  const row = document.createElement("div");
  row.className = "log-line";
  row.textContent = line;
  logElement.appendChild(row);
}

function appendHarnessOutcome(success: boolean): void {
  const row = document.createElement("div");
  row.className = `log-outcome log-outcome--${success ? "success" : "failure"}`;
  const dot = document.createElement("span");
  dot.className = `status-dot status-dot--${success ? "success" : "failure"}`;
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = success ? "Success: prove flow completed" : "Failure: prove flow did not complete successfully";
  row.append(dot, label);
  logElement.appendChild(row);
}

async function copyJsonDetailToClipboard(): Promise<void> {
  const text = jsonDetailBodyEl.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const prev = jsonDetailCopyButtonEl.textContent;
  jsonDetailCopyButtonEl.textContent = "Copied";
  window.setTimeout(() => {
    jsonDetailCopyButtonEl.textContent = prev ?? "Copy";
  }, 1500);
}

function openJsonDetailModal(title: string, data: unknown): void {
  jsonDetailTitleEl.textContent = title;
  try {
    jsonDetailBodyEl.textContent = JSON.stringify(data, null, 2);
  } catch {
    jsonDetailBodyEl.textContent = String(data);
  }
  jsonDetailModalEl.hidden = false;
  jsonDetailModalEl.setAttribute("aria-hidden", "false");
}

function closeJsonDetailModal(): void {
  jsonDetailModalEl.hidden = true;
  jsonDetailModalEl.setAttribute("aria-hidden", "true");
}

jsonDetailModalEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-modal-dismiss]")) {
    closeJsonDetailModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !jsonDetailModalEl.hidden) {
    closeJsonDetailModal();
  }
});

jsonDetailCopyButtonEl.addEventListener("click", (event) => {
  event.stopPropagation();
  void copyJsonDetailToClipboard();
});

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

function buildLivePrimusSdkOverride(): NonNullable<BrowserHarnessConfigOverrideFile["primus"]> {
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
    templateResolver: {
      baseUrl: INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.baseUrl,
      resolveTemplatePath: INTERNAL_BNB_ZKID_CONFIG.primus.templateResolver.resolveTemplatePath
    },
    signer: {
      baseUrl: INTERNAL_BNB_ZKID_CONFIG.primus.signer.baseUrl,
      signPath: INTERNAL_BNB_ZKID_CONFIG.primus.signer.signPath
    }
  };
}

function buildLiveSdkConfig(): BrowserHarnessConfigOverrideFile {
  return {
    gateway: {
      baseUrl: resolveBrevisGatewayBaseUrl()
    },
    primus: buildLivePrimusSdkOverride()
  };
}

/** Static JSON aligned with the three Gateway interfaces; provider options still come from `fixtures/config.json`, matching the fixture configPath. Primus uses the real SDK + PADO. */
function buildBrevisFixtureGatewayWithLivePrimusConfig(): BrowserHarnessConfigOverrideFile {
  return {
    gateway: {
      mode: "fixture",
      configPath: resolveFixtureUrl("./fixtures/config.json"),
      createProofRequestPath: resolveFixtureUrl("./fixtures/brevis-v1-proof-requests-post.json"),
      proofRequestStatusPath: resolveFixtureUrl("./fixtures/brevis-v1-proof-requests-get.json")
    },
    primus: {
      mode: "sdk",
      ...buildLivePrimusSdkOverride()
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
  const row = document.createElement("div");
  row.className = "log-line log-line--with-action";

  const label = document.createElement("span");
  label.textContent = `gateway ${event.transport} createProofRequest:`;

  const detailBtn = document.createElement("button");
  detailBtn.type = "button";
  detailBtn.className = "log-detail-trigger";
  detailBtn.textContent = "detail";
  const payload = event.input;
  detailBtn.addEventListener("click", () => {
    openJsonDetailModal(`Gateway createProofRequest (${event.transport})`, payload);
  });

  row.append(label, detailBtn);
  logElement.appendChild(row);
};

updateModeUi();
modeSelectElement.addEventListener("change", () => {
  void refreshBrevisHarnessCatalog();
});

void refreshBrevisHarnessCatalog();

runButton.addEventListener("click", async () => {
  logElement.replaceChildren();
  runButton.disabled = true;
  modeSelectElement.disabled = true;
  brevisProviderSelectElement.disabled = true;

  let harnessSucceeded: boolean | null = null;

  try {
    if (
      harnessUsesBrevisProviderPicker() &&
      (!brevisHarnessCatalogLoaded || brevisHarnessCatalog.length === 0)
    ) {
      writeLog(
        "This mode requires a provider list: wait until the dropdown has options and the log shows no GET /v1/config error."
      );
      harnessSucceeded = false;
      return;
    }
    // Harness-only override: normal SDK consumers should rely on embedded defaults instead.
    (globalThis as GlobalWithConfig).__BNB_ZKID_CONFIG_URL__ = prepareConfigUrl();
    writeLog(`mode: ${modeSelectElement.value}`);
    if (harnessUsesBrevisProviderPicker()) {
      const row = getSelectedBrevisRow();
      writeLog(
        `provider: ${row?.providerDescription ?? ""} — ${row?.propertyDescription ?? ""} (${row?.identityPropertyId ?? ""})`
      );
      const pp = resolveBrowserHarnessProvingParams();
      writeLog(
        `prove.provingParams (businessParams from GET /v1/config): ${pp === undefined ? "(omit)" : JSON.stringify(pp)}`
      );
    }
    const client = new BnbZkIdClient();
    const initResult = await client.init({
      appId: BROWSER_HARNESS_APP_ID
    });

    writeLog(`init: ${JSON.stringify(initResult)}`);
    if (!initResult.success) {
      harnessSucceeded = false;
      return;
    }

    const provingParams = resolveBrowserHarnessProvingParams();
    const proveInput: ProveInput = {
      clientRequestId: new Date().getTime().toString(),
      userAddress: "0xA91ba9Eb139d90C55a8F04a31d894De0aBbf5a51", // steam
      // userAddress: "0xB12a1f7035FdCBB4cC5Fa102C01346BD45439Adf",// binance  okx github
      // userAddress: "0x8F0D4188307496926d785fB00E08Ed772f3be890",// amazon
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
    harnessSucceeded = true;
  } catch (error) {
    harnessSucceeded = false;
    if (error instanceof BnbZkIdProveError) {
      writeLog(`error: ${JSON.stringify(error.toJSON(), null, 2)}`);
    } else {
      writeLog(`error: ${describeError(error)}`);
    }
  } finally {
    if (harnessSucceeded !== null) {
      appendHarnessOutcome(harnessSucceeded);
    }
    runButton.disabled = false;
    modeSelectElement.disabled = false;
    updateModeUi();
    brevisProviderSelectElement.disabled = !harnessUsesBrevisProviderPicker();
  }
});

clearButton.addEventListener("click", () => {
  logElement.replaceChildren();
});
