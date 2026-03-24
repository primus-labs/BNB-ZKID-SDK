import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import type { GatewayClient, GatewayConfig } from "../gateway/types.js";
import type { PrimusProvingDataRegistry } from "../primus/request-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { collectPrimusAttestationFromRegistry } from "./collect-primus-attestation-from-registry.js";
import type {
  ProveFailureResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveResult,
  ProvingParams
} from "../types/public.js";

interface ExecuteProveWorkflowInput {
  appId: string;
  gatewayConfig: GatewayConfig;
  gatewayClient: GatewayClient;
  primusAdapter: PrimusZkTlsAdapter;
  primusRegistry: PrimusProvingDataRegistry;
  proveInput: ProveInput;
  options?: ProveOptions;
}

export async function executeProveWorkflow(input: ExecuteProveWorkflowInput): Promise<ProveResult> {
  if (!isValidProvingParams(input.proveInput.provingParams)) {
    return buildFailureResult(input.proveInput.clientRequestId, {
      code: "VALIDATION_ERROR",
      message: "provingParams must be a record of numeric threshold arrays."
    });
  }

  resolveProviderMapping(input.gatewayConfig, input.proveInput.identityPropertyId);
  await emitProgress(input.options, {
    status: "initialized",
    clientRequestId: input.proveInput.clientRequestId
  });
  await emitProgress(input.options, {
    status: "data_verifying",
    clientRequestId: input.proveInput.clientRequestId
  });

  const bundle = await collectPrimusAttestationFromRegistry(
    input.primusAdapter,
    input.primusRegistry,
    {
      proveInput: input.proveInput,
      additionParams: {
        appId: input.appId
      }
    }
  );

  const created = await input.gatewayClient.createProofRequest({
    appId: input.appId,
    identityPropertyId: input.proveInput.identityPropertyId,
    zkTlsProof: bundle.zkTlsProof,
    ...(input.proveInput.provingParams === undefined
      ? {}
      : { businessParams: input.proveInput.provingParams })
  });

  await emitProgress(input.options, {
    status: "proof_generating",
    clientRequestId: input.proveInput.clientRequestId,
    proofRequestId: created.proofRequestId
  });

  const status = await input.gatewayClient.getProofRequestStatus(created.proofRequestId);
  if (status.status === "failed") {
    await emitProgress(input.options, {
      status: "failed",
      clientRequestId: input.proveInput.clientRequestId,
      proofRequestId: created.proofRequestId
    });

    return buildFailureResult(
      input.proveInput.clientRequestId,
      status.error ?? {
        code: "PROOF_REQUEST_FAILED",
        message: "Gateway returned a failed proof request."
      },
      created.proofRequestId
    );
  }

  if (!status.walletAddress) {
    throw new SdkError("Gateway success payload is missing walletAddress.", "VALIDATION_ERROR");
  }

  await emitProgress(input.options, {
    status: "on_chain_attested",
    clientRequestId: input.proveInput.clientRequestId,
    proofRequestId: created.proofRequestId
  });

  return {
    status: "on_chain_attested",
    clientRequestId: input.proveInput.clientRequestId,
    walletAddress: status.walletAddress,
    providerId: status.providerId,
    identityPropertyId: status.identityPropertyId,
    proofRequestId: created.proofRequestId
  };
}

function resolveProviderMapping(
  gatewayConfig: GatewayConfig,
  identityPropertyId: string
): void {
  for (const provider of gatewayConfig.providers) {
    const matched = provider.identityProperties.some(
      (identityProperty) => identityProperty.identityPropertyId === identityPropertyId
    );
    if (matched) {
      return;
    }
  }

  throw new ConfigurationError("Gateway config does not support identityPropertyId.", {
    identityPropertyId
  });
}

function isValidProvingParams(provingParams: ProvingParams | undefined): boolean {
  if (!provingParams) {
    return true;
  }

  return Object.values(provingParams).every((values) =>
    Array.isArray(values) && values.every((value) => Number.isFinite(value))
  );
}

function buildFailureResult(
  clientRequestId: string,
  error: { code: string; message: string; details?: Record<string, unknown> },
  proofRequestId?: string
): ProveFailureResult {
  const result: ProveFailureResult = {
    status: "failed",
    clientRequestId,
    error
  };

  if (proofRequestId) {
    result.proofRequestId = proofRequestId;
  }

  return result;
}

async function emitProgress(
  options: ProveOptions | undefined,
  event: ProveProgressEvent
): Promise<void> {
  await options?.onProgress?.(event);
}
