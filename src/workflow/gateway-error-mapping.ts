import type { GatewayProofRequestStatusResult } from "../gateway/types.js";
import { isNetworkLikeError } from "../errors/prove-error.js";

export function isGatewayStatusOnChainAttested(
  status: GatewayProofRequestStatusResult["status"]
): boolean {
  return status === "onchain_attested" || status === "on_chain_attested";
}

export function isGatewayStatusTerminalFailure(
  status: GatewayProofRequestStatusResult["status"]
): boolean {
  return (
    status === "failed" ||
    status === "prover_failed" ||
    status === "packaging_failed" ||
    status === "submission_failed" ||
    status === "internal_error"
  );
}

export function classifyGatewayTerminalFailureCode(
  status: GatewayProofRequestStatusResult["status"]
): "30003" | "40000" | "30002" {
  if (status === "internal_error") {
    return "30003";
  }
  if (status === "submission_failed") {
    return "40000";
  }
  return "30002";
}

export function classifyGatewayApiDetailsError(
  details: Record<string, unknown>
): "30001" | "30003" | "30002" {
  if (details.category === "binding_conflict") {
    return "30001";
  }
  if (details.status === "internal_error") {
    return "30003";
  }
  return "30002";
}

export function classifyGatewayThrownError(error: unknown): "30004" | "30002" {
  if (isNetworkLikeError(error)) {
    return "30004";
  }
  return "30002";
}
