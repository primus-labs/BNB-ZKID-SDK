import { SdkError } from "./sdk-error.js";

/** Top-level `prove` / unified machine codes (`BnbZkIdProveError` / aligned `init` failures). */
export type BnbZkIdProveErrorCode =
  | "00000"
  | "00001"
  | "00002"
  | "00003"
  | "00004"
  | "00005"
  | "00006"
  | "00007"
  | "10001"
  | "10002"
  | "10003"
  | "10004"
  | "10013"
  | "20001"
  | "20002"
  | "20003"
  | "20004"
  | "20005"
  | "20006"
  | "20007"
  | "30000"
  | "30001"
  | "30002"
  | "30003"
  | "30004"
  | "30005"
  | "40000";

const PROVE_ERROR_MESSAGES_MAP: Record<BnbZkIdProveErrorCode, string> = {
  "00000":
    "Primus Extension not detected. Please install or enable the Primus Extension from the Chrome Web Store (https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe), and try again.",
  "00001": "SDK initialization failed. Please call init() successfully before calling prove().",
  "00002":
    "Invalid wallet address. User wallet address must be a valid EVM address (0x followed by 40 hex characters).",
  "00003": "Invalid appId. [SDK-A00/SDK-A01].",
  "00004": "Invalid identityPropertyId. [SDK-I00/SDK-I01].",
  "00005": "clientRequestId is empty.",
  "00006": "Request denied. Unauthorized address.",
  "00007": "proofRequestId is empty.",
  "10001": "Failed to initiate the algorithm.",
  "10002": "Verification timed out. Please try again. [P-00002/P-00014].",
  "10003": "A verification task is already in progress.",
  "10004": "Verification cancelled by user.",
  "10013": "No verifiable data detected. Please confirm login status and account details.",
  "20001": "Unstable internet connection. Please try again. [P-10001~10004].",
  "20002":
    "Internal algorithm error. Please contact support. [P-20001~20005/40001/40002/50000:501/50000:502/50000:505/50000:507/50000:508/50000:510/50011].",
  "20003": "Data schema mismatch. Please contact support. [P-30001:301/30001:404/30004/30005/30006].",
  "20004": "Too many attempts. Please try again later. [P-00000/30001:403/30001:429].",
  "20005":
    "Response processing error. Please try again. [P-30001/P-30002/P-30001:302/P-30003].",
  "20006": "Session expired. Please log in to the data source website again. [P-30001:401].",
  "20007": "Service request error. Please try again. [P-50003/P-50004/P-50006/P-50009/P-99999].",
  "30000": "Duplicate request. Task already in progress.",
  "30001": "Proof binding error. This data is already bound to another address.",
  "30002": "Proof generation failure.",
  "30003": "Prover service internal error.",
  "30004": "Connection to the prover service unstable.",
  "30005": "Fetching the proof generation result timed out.",
  "40000": "On-chain submission failed."
};

/** Normalize zktls-js-sdk `code` (string or finite number). */
export function normalizePrimusSdkWireCode(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    return t === "" ? undefined : t;
  }
  return undefined;
}

/**
 * Reads normalized Primus wire code from thrown object.
 * - A = `code`
 * - B = `A` when `subCode` absent
 * - B = `${A}:${subCode}` when `subCode` present
 */
export function extractPrimusWireCodeFromUnknown(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }
  const o = err as Record<string, unknown>;
  if (!("code" in o)) {
    return undefined;
  }
  const code = normalizePrimusSdkWireCode(o.code);
  if (code === undefined) {
    return undefined;
  }
  const subCode = normalizePrimusSdkWireCode(o.subCode);
  return subCode === undefined ? code : `${code}:${subCode}`;
}

/**
 * Maps a Primus / zktls-js-sdk wire `code` to the SDK outer {@link BnbZkIdProveErrorCode}.
 * Unlisted non-empty codes fall through to `00007` with {@link undefinedSdkProcessingErrorMessage}.
 */
function primusMessageWithWire(base: string, wire: string): string {
  return `${base} [P-${wire}].`;
}

/**
 * Primus stage fallback (unmapped wire or error shape without extractable `code`).
 * Uses `00007` with a distinct message from `proofRequestId is empty.` (same code, overridden message).
 */
export function undefinedSdkProcessingErrorMessage(wire: string | undefined): string {
  const base = "Undefined SDK processing error.";
  const w = typeof wire === "string" ? wire.trim() : "";
  if (w === "") {
    return base;
  }
  return `${base} [SDK-${w}]`;
}

export function resolvePrimusStageErrorFromUnknown(err: unknown): {
  code: BnbZkIdProveErrorCode;
  message: string;
} {
  const wire = extractPrimusWireCodeFromUnknown(err);
  if (wire === undefined) {
    return {
      code: "00007",
      message: undefinedSdkProcessingErrorMessage(undefined)
    };
  }
  if (wire === "00006") {
    return {
      code: "00000",
      message: getDefaultProveErrorMessage("00000")
    };
  }
  if (wire === "00001") {
    return {
      code: "10001",
      message: getDefaultProveErrorMessage("10001")
    };
  }
  if (wire === "00002" || wire === "00014") {
    return {
      code: "10002",
      message: primusMessageWithWire("Verification timed out. Please try again.", wire)
    };
  }
  if (wire === "00003") {
    return {
      code: "10003",
      message: getDefaultProveErrorMessage("10003")
    };
  }
  if (wire === "00004") {
    return {
      code: "10004",
      message: getDefaultProveErrorMessage("10004")
    };
  }
  if (wire === "00013") {
    return {
      code: "10013",
      message: getDefaultProveErrorMessage("10013")
    };
  }
  if (wire === "10001" || wire === "10002" || wire === "10003" || wire === "10004") {
    return {
      code: "20001",
      message: primusMessageWithWire("Unstable internet connection. Please try again.", wire)
    };
  }
  if (
    wire === "20001" ||
    wire === "20002" ||
    wire === "20003" ||
    wire === "20004" ||
    wire === "20005" ||
    wire === "40001" ||
    wire === "40002" ||
    wire === "50000:501" ||
    wire === "50000:502" ||
    wire === "50000:505" ||
    wire === "50000:507" ||
    wire === "50000:508" ||
    wire === "50000:510" ||
    wire === "50011"
  ) {
    return {
      code: "20002",
      message: primusMessageWithWire("Internal algorithm error. Please contact support.", wire)
    };
  }
  if (
    wire === "30001:301" ||
    wire === "30001:404" ||
    wire === "30004" ||
    wire === "30005" ||
    wire === "30006"
  ) {
    return {
      code: "20003",
      message: primusMessageWithWire("Data schema mismatch. Please contact support.", wire)
    };
  }
  if (wire === "00000" || wire === "30001:403" || wire === "30001:429") {
    return {
      code: "20004",
      message: primusMessageWithWire("Too many attempts. Please try again later.", wire)
    };
  }
  // `wire` is normalized by `extractPrimusWireCodeFromUnknown` (e.g. code 30001 + subCode 302 → "30001:302").
  if (
    wire === "30001" ||
    wire === "30002" ||
    wire === "30001:302" ||
    wire === "30003"
  ) {
    return {
      code: "20005",
      message: primusMessageWithWire("Response processing error. Please try again.", wire)
    };
  }
  if (wire === "30001:401") {
    return {
      code: "20006",
      message: getDefaultProveErrorMessage("20006")
    };
  }
  if (
    wire === "50003" ||
    wire === "50004" ||
    wire === "50006" ||
    wire === "50009" ||
    wire === "99999"
  ) {
    return {
      code: "20007",
      message: primusMessageWithWire("Service request error. Please try again.", wire)
    };
  }
  if (wire === "-210001") {
    return {
      code: "30000",
      message: getDefaultProveErrorMessage("30000")
    };
  }
  return {
    code: "00007",
    message: undefinedSdkProcessingErrorMessage(wire)
  };
}

/** Thrown when {@link import("../types/public.js").BnbZkIdClientMethods.prove} fails. Success returns `ProveSuccessResult` only. */
export class BnbZkIdProveError extends Error {
  /** Stable machine-readable code (see {@link BnbZkIdProveErrorCode}). */
  override readonly name = "BnbZkIdProveError";
  readonly proveCode: BnbZkIdProveErrorCode;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;

  constructor(
    proveCode: BnbZkIdProveErrorCode,
    message: string,
    context?: { clientRequestId?: string; proofRequestId?: string }
  ) {
    super(message);
    this.proveCode = proveCode;
    if (context?.clientRequestId !== undefined) {
      this.clientRequestId = context.clientRequestId;
    }
    if (context?.proofRequestId !== undefined) {
      this.proofRequestId = context.proofRequestId;
    }
  }

  /** Alias for {@link proveCode}; matches `BnbZkIdError.code` shape for logging. */
  get code(): string {
    return this.proveCode;
  }

  /** Stable `{ code, message, clientRequestId?, proofRequestId? }` shape for logging / `JSON.stringify`. */
  toJSON(): {
    code: BnbZkIdProveErrorCode;
    message: string;
    clientRequestId?: string;
    proofRequestId?: string;
  } {
    return {
      code: this.proveCode,
      message: this.message,
      ...(this.clientRequestId !== undefined ? { clientRequestId: this.clientRequestId } : {}),
      ...(this.proofRequestId !== undefined ? { proofRequestId: this.proofRequestId } : {})
    };
  }
}

export function getDefaultProveErrorMessage(code: BnbZkIdProveErrorCode): string {
  return PROVE_ERROR_MESSAGES_MAP[code];
}

export function getInvalidAppIdMessage(reason: "empty" | "not_enabled"): string {
  if (reason === "empty") {
    return "Invalid appId. [SDK-A00].";
  }
  return "Invalid appId. [SDK-A01].";
}

export function getInvalidIdentityPropertyIdMessage(reason: "empty" | "not_supported"): string {
  if (reason === "empty") {
    return "Invalid identityPropertyId. [SDK-I00].";
  }
  return "Invalid identityPropertyId. [SDK-I01].";
}

export function createBnbZkIdProveError(
  proveCode: BnbZkIdProveErrorCode,
  context?: { clientRequestId?: string; proofRequestId?: string; messageOverride?: string }
): BnbZkIdProveError {
  const message = context?.messageOverride ?? getDefaultProveErrorMessage(proveCode);
  const errContext =
    context === undefined
      ? undefined
      : {
          ...(context.clientRequestId !== undefined ? { clientRequestId: context.clientRequestId } : {}),
          ...(context.proofRequestId !== undefined ? { proofRequestId: context.proofRequestId } : {})
        };
  const passContext =
    errContext !== undefined &&
    (errContext.clientRequestId !== undefined || errContext.proofRequestId !== undefined);
  return new BnbZkIdProveError(proveCode, message, passContext ? errContext : undefined);
}

/** Shared transport/network detection for mapping to SDK code `30004`. */
export function isNetworkLikeError(err: unknown): boolean {
  if (err instanceof SdkError && err.code === "TRANSPORT_ERROR") {
    return true;
  }
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const e = err as Record<string, unknown>;
  const name = typeof e.name === "string" ? e.name : "";
  if (name === "AbortError") {
    return true;
  }
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout")
  );
}
