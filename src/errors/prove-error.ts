import { SdkError } from "./sdk-error.js";

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

/** Top-level `prove` failure codes surfaced in `catch` (`BnbZkIdProveError.code`). */
export type BnbZkIdProveErrorCode = "00000" | "00001" | "00002" | "00003";

const PROVE_ERROR_MESSAGES: Record<BnbZkIdProveErrorCode, string> = {
  "00000": "Failed to initialize",
  "00001": "Failed to generate zkTLS proof",
  "00002": "Failed to generate zkVM proof",
  "00003": "Invalid parameters"
};

/** Thrown when {@link import("../types/public.js").BnbZkIdClientMethods.prove} fails. Success returns `ProveSuccessResult` only. */
export class BnbZkIdProveError extends Error {
  /** One of `00000`–`00003`. */
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
  return { cause: serializeErrorForProveDetails(err) };
}
