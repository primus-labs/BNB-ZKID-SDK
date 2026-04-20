import type {
  QueryProofResultResult,
  QueryProofResultSuccessResult
} from "../types/public.js";
import type { GatewayProofRequestStatusResult } from "../gateway/types.js";
import { isGatewayStatusOnChainAttested } from "./gateway-error-mapping.js";
import { normalizeGatewayAttestedStatusOrThrow } from "./gateway-success-normalizer.js";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
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
    return {
      status: input.status.status,
      ...shared
    };
  }

  throw new Error(`UNKNOWN_QUERY_PROOF_RESULT_STATUS:${String(input.status.status)}`);
}
