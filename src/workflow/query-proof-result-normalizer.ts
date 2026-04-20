import type { BnbZkIdFrameworkError } from "../types/framework-error.js";
import type {
  QueryProofResultFailure,
  QueryProofResultResult,
  QueryProofResultSuccessResult
} from "../types/public.js";
import type { GatewayProofFailure, GatewayProofRequestStatusResult } from "../gateway/types.js";
import { isGatewayStatusOnChainAttested } from "./gateway-error-mapping.js";
import { normalizeGatewayAttestedStatusOrThrow } from "./gateway-success-normalizer.js";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function unknownTerminalMessage(status: GatewayProofRequestStatusResult["status"]): string {
  if (status === "submission_failed") {
    return "Gateway reported an on-chain submission failure.";
  }
  if (status === "internal_error") {
    return "Gateway reported an internal prover error.";
  }
  return "Gateway reported a terminal proof failure.";
}

export function queryProofResultFailureFromFrameworkError(
  error: BnbZkIdFrameworkError
): QueryProofResultFailure {
  const category = nonEmptyString(error.category);
  const code = nonEmptyString(error.code);
  const message = nonEmptyString(error.message) ?? nonEmptyString(error.detail);
  const detail = nonEmptyString(error.detail);
  return {
    source: "framework_error",
    ...(category !== undefined ? { category } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(detail !== undefined ? { detail } : {})
  };
}

export function queryProofResultFailureFromLifecycleFailure(
  failure: GatewayProofFailure | Record<string, unknown>
): QueryProofResultFailure {
  const record = failure as Record<string, unknown>;
  const reason = nonEmptyString(record.reason);
  const detail = nonEmptyString(record.detail);
  const message = nonEmptyString(record.message) ?? detail;
  return {
    source: "lifecycle_failure",
    ...(reason !== undefined ? { reason } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(detail !== undefined ? { detail } : {})
  };
}

export function normalizeQueryProofResultOrThrow(input: {
  status: GatewayProofRequestStatusResult;
  requestedProofRequestId: string;
  clientRequestId?: string;
}): QueryProofResultResult {
  const normalizedProofRequestId = nonEmptyString(input.status.proofRequestId) ?? input.requestedProofRequestId;
  const shared = {
    proofRequestId: normalizedProofRequestId,
    ...(input.clientRequestId !== undefined ? { clientRequestId: input.clientRequestId } : {})
  };

  if (isGatewayStatusOnChainAttested(input.status.status)) {
    const normalized = normalizeGatewayAttestedStatusOrThrow(input.status);
    const result: QueryProofResultSuccessResult = {
      status: "on_chain_attested",
      walletAddress: normalized.walletAddress,
      providerId: normalized.providerId,
      identityPropertyId: normalized.identityPropertyId,
      proofRequestId: normalized.proofRequestId ?? normalizedProofRequestId,
      ...(input.clientRequestId !== undefined ? { clientRequestId: input.clientRequestId } : {})
    };
    return result;
  }

  if (
    input.status.status === "initialized" ||
    input.status.status === "generating" ||
    input.status.status === "submitting"
  ) {
    return {
      status: input.status.status,
      ...shared
    };
  }

  if (
    input.status.status === "failed" ||
    input.status.status === "prover_failed" ||
    input.status.status === "packaging_failed" ||
    input.status.status === "submission_failed" ||
    input.status.status === "internal_error"
  ) {
    let failure: QueryProofResultFailure | undefined;
    if (input.status.failure != null) {
      failure = queryProofResultFailureFromLifecycleFailure(input.status.failure);
    } else if (input.status.error != null) {
      failure = queryProofResultFailureFromFrameworkError(input.status.error);
    } else {
      failure = {
        source: "unknown",
        message: unknownTerminalMessage(input.status.status)
      };
    }

    return {
      status: input.status.status,
      ...shared,
      ...(failure !== undefined ? { failure } : {})
    };
  }

  throw new Error(`UNKNOWN_QUERY_PROOF_RESULT_STATUS:${String(input.status.status)}`);
}
