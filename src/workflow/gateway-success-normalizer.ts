import type { GatewayProofRequestStatusResult } from "../gateway/types.js";
import { isGatewayStatusOnChainAttested } from "./gateway-error-mapping.js";

export function resolveIdentityPropertyIdFromStatus(
  status: GatewayProofRequestStatusResult
): string | undefined {
  const fromNested =
    status.identityProperty?.id?.trim() || status.identityProperty?.identityPropertyId?.trim();
  if (fromNested) {
    return fromNested;
  }
  return status.identityPropertyId?.trim();
}

export function normalizeGatewayAttestedStatusOrThrow(
  status: GatewayProofRequestStatusResult
): {
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
} {
  if (!isGatewayStatusOnChainAttested(status.status)) {
    throw new Error("NOT_ONCHAIN_ATTESTED");
  }

  if (!status.walletAddress) {
    throw new Error("MISSING_WALLET_ADDRESS");
  }

  const identityPropertyId = resolveIdentityPropertyIdFromStatus(status);
  if (!identityPropertyId) {
    throw new Error("MISSING_IDENTITY_PROPERTY_ID");
  }

  const providerId = status.providerId?.trim();
  if (!providerId) {
    throw new Error("MISSING_PROVIDER_ID");
  }

  return {
    walletAddress: status.walletAddress,
    providerId,
    identityPropertyId,
    ...(status.proofRequestId?.trim() ? { proofRequestId: status.proofRequestId.trim() } : {})
  };
}
