import { SdkError } from "./sdk-error.js";
import type { BnbZkIdError } from "../types/public.js";

/** `@superorange/zka-js-sdk` / legacy Primus `ZkAttestationError` (not always `instanceof Error`). */
function isZkAttestationLike(
  err: unknown
): err is { code: string; message: string; data?: unknown } {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const o = err as Record<string, unknown>;
  return typeof o.code === "string" && typeof o.message === "string";
}

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
  | "10000"
  | "10001"
  | "10002"
  | "10003";

const PROVE_ERROR_MESSAGES: Record<BnbZkIdProveErrorCode, string> = {
  "00000": "Not detected the Primus Extension",
  "00001": "Failed to initialize",
  "00002": "A verification process is in progress. Please try again later.",
  "00003": "The user closes or cancels the verification process.",
  "00004":
    "Target data missing. Please check whether the data json path in the request URL’s response aligns with your template.",
  "00005": "Unstable internet connection. Please try again.",
  "00006": "Failed to generate zkTLS proof",
  "00007": "Invalid parameters",
  "10000": "This address has pending proof for identityPropertyId.",
  "10001": "This address is already bound to another account.",
  "10002": "Failed to onChain",
  "10003": "Failed to generate zkVM proof"
};
// const PROVE_ERROR_MESSAGES: Record<BnbZkIdProveErrorCode, string> = {
//   "00000": 'Not detected the Primus Extension', // (zktlssdk-00006)
//   "00001": "Failed to initialize",
//   '00002': 'A verification process is in progress. Please try again later.',// (zktlssdk-00003)
//   '00003': 'The user closes or cancels the verification process.',// zktlssdk-00004)
//   '00004': 'Target data missing. Please check whether the data json path in the request URL’s response aligns with your template.',// (zktlssdk-00013)
//   '00005':'Unstable internet connection. Please try again.',// (zktlssdk-10001,10002,10003,10004)
//   "00006": "Failed to generate zkTLS proof",
//   "00007": "Invalid parameters",
//   '10000': 'This address has pending proof for identityPropertyId.',// (zktlssdk-210001)
//   "10001": 'This address is already bound to another account.',// (POST /v1/proof-requests response.error.category:binding_conflict)
//   "10002": 'Failed to onChain',// (GET /v1/proof-requests/{proofRequestId} response.status: submission_failed
//   "10003": "Failed to generate zkVM proof",
// };

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

/** Reads `.code` from a thrown object, if present. */
export function extractPrimusWireCodeFromUnknown(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }
  const o = err as Record<string, unknown>;
  if (!("code" in o)) {
    return undefined;
  }
  return normalizePrimusSdkWireCode(o.code);
}

/**
 * Maps a Primus / zktls-js-sdk wire `code` to the SDK outer {@link BnbZkIdProveErrorCode}.
 * Unlisted non-empty codes fall through to `00006` (generic zkTLS failure).
 */
export function mapPrimusWireCodeToOuterProveCode(wire: string): BnbZkIdProveErrorCode {
  switch (wire) {
    case "00006":
      return "00000";
    case "00003":
      return "00002";
    case "00004":
      return "00003";
    case "00013":
      return "00004";
    case "10001":
    case "10002":
    case "10003":
    case "10004":
      return "00005";
    case "-210001":
      return "10000";
    default:
      return "00006";
  }
}

/** Outer code for `prove` zkTLS stage from an unknown thrown value (no wire code → `00006`). */
export function outerProveCodeForPrimusProveFailure(err: unknown): BnbZkIdProveErrorCode {
  const wire = extractPrimusWireCodeFromUnknown(err);
  if (wire === undefined) {
    return "00006";
  }
  return mapPrimusWireCodeToOuterProveCode(wire);
}

/** Outer code for `init` Primus failure (no wire code → `00001`). */
export function outerProveCodeForPrimusInitFailure(err: unknown): BnbZkIdProveErrorCode {
  const wire = extractPrimusWireCodeFromUnknown(err);
  if (wire === undefined) {
    return "00001";
  }
  return mapPrimusWireCodeToOuterProveCode(wire);
}

/** Thrown when {@link import("../types/public.js").BnbZkIdClientMethods.prove} fails. Success returns `ProveSuccessResult` only. */
export class BnbZkIdProveError extends Error {
  /** Stable machine-readable code (see {@link BnbZkIdProveErrorCode}). */
  override readonly name = "BnbZkIdProveError";
  readonly proveCode: BnbZkIdProveErrorCode;
  /**
   * Stage-specific payloads: `primus` (zkTLS SDK) vs `brevis` (Gateway HTTP / Framework — see
   * {@link import("../types/framework-error.js").BnbZkIdFrameworkError} for Framework `error` fields).
   */
  readonly details: Record<string, unknown>;
  readonly clientRequestId?: string;
  readonly proofRequestId?: string;

  constructor(
    proveCode: BnbZkIdProveErrorCode,
    message: string,
    details: Record<string, unknown>,
    context?: { clientRequestId?: string; proofRequestId?: string }
  ) {
    super(message);
    this.proveCode = proveCode;
    this.details = details;
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

  /** Stable `{ code, message, details }` shape for logging / `JSON.stringify`. */
  toJSON(): {
    code: BnbZkIdProveErrorCode;
    message: string;
    details: Record<string, unknown>;
    clientRequestId?: string;
    proofRequestId?: string;
  } {
    return {
      code: this.proveCode,
      message: this.message,
      details: this.details,
      ...(this.clientRequestId !== undefined ? { clientRequestId: this.clientRequestId } : {}),
      ...(this.proofRequestId !== undefined ? { proofRequestId: this.proofRequestId } : {})
    };
  }
}

export function getDefaultProveErrorMessage(code: BnbZkIdProveErrorCode): string {
  return PROVE_ERROR_MESSAGES[code];
}

/** Shared `details.reason` for `init` / prove-ordering failures (align `InitResult.error` with thrown prove errors). */
export const INIT_FAILURE_REASON_APP_ID_NOT_ENABLED = "appId_not_enabled" as const;
export const INIT_FAILURE_REASON_TEMPLATE_RESOLVE = "template_resolve_failed" as const;
export const INIT_FAILURE_REASON_PRIMUS_INIT = "primus_init_failed" as const;
export const INIT_FAILURE_REASON_PROVE_BEFORE_INIT = "init_must_succeed_before_prove" as const;

/**
 * Clearer than table `00001` alone: `prove()` ran before a successful `init()`.
 * Prefer over {@link getDefaultProveErrorMessage}(`"00001"`) for this case only.
 */
export const MESSAGE_PROVE_BEFORE_INIT = "Call init() successfully before prove().";

/**
 * `prove()` before `init`: same outer code as other init failures (`00001`), explicit `details.reason`, and a dedicated message.
 */
export function createProveBeforeInitError(clientRequestId: string): BnbZkIdProveError {
  return createBnbZkIdProveError(
    "00001",
    {
      reason: INIT_FAILURE_REASON_PROVE_BEFORE_INIT
    },
    { clientRequestId, messageOverride: MESSAGE_PROVE_BEFORE_INIT }
  );
}

/**
 * Maps an `init`-time failure from `@primuslabs/zktls-js-sdk` into {@link BnbZkIdError} for
 * `init` failure results (plain objects and non-{@link Error} throws are normalized here).
 * Outer `code` / `message` use the unified table; SDK payload under `details.primus`.
 */
export function bnbZkIdErrorFromPrimusInitFailure(err: unknown): BnbZkIdError {
  const primus = serializePrimusStageDetails(err);
  const outer = outerProveCodeForPrimusInitFailure(err);
  return {
    code: outer,
    message: getDefaultProveErrorMessage(outer),
    details: {
      reason: INIT_FAILURE_REASON_PRIMUS_INIT,
      primus
    }
  };
}

export function createBnbZkIdProveError(
  proveCode: BnbZkIdProveErrorCode,
  details: Record<string, unknown>,
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
  return new BnbZkIdProveError(
    proveCode,
    message,
    details,
    passContext ? errContext : undefined
  );
}

/** Normalizes `unknown` and `SdkError` for nested `cause` / transport metadata. */
export function serializeErrorForProveDetails(err: unknown): Record<string, unknown> {
  if (err instanceof SdkError) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      ...(err.details !== undefined ? { sdkDetails: err.details } : {})
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  if (typeof err === "object" && err !== null) {
    try {
      return { value: err as Record<string, unknown> };
    } catch {
      return { value: String(err) };
    }
  }
  return { value: String(err) };
}

/** Value for `BnbZkIdProveError.details.primus` (zkTLS SDK attestation errors vs generic causes). */
export function serializePrimusStageDetails(err: unknown): Record<string, unknown> {
  if (isZkAttestationLike(err)) {
    const out: Record<string, unknown> = {
      code: err.code,
      message: err.message
    };
    if (err.data !== undefined) {
      out.data = err.data;
    }
    return out;
  }
  if (typeof err === "object" && err !== null && !Array.isArray(err)) {
    const o = err as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code.trim() : "";
    if (code !== "") {
      const out: Record<string, unknown> = { code };
      if (typeof o.message === "string" && o.message.trim() !== "") {
        out.message = o.message.trim();
      }
      if (o.data !== undefined) {
        out.data = o.data;
      }
      return out;
    }
  }
  return { cause: serializeErrorForProveDetails(err) };
}
