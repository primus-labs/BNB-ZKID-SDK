import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import {
  cloneGatewayBusinessParamsForRequest,
  isBusinessParamsObject
} from "../gateway/business-params.js";
import {
  findIdentityPropertyConfig,
  resolveProviderIdForIdentityPropertyId
} from "../gateway/status-identity.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayProofFailure,
  GatewayProofRequestStatusResult
} from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { collectPrimusAttestationFromTemplateResolver } from "./collect-primus-attestation-from-resolver.js";
import type {
  ProveFailureResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveResult
} from "../types/public.js";

/** Framework `GET /v1/proof-requests/{id}` polling interval while status is in-flight. */
const PROOF_REQUEST_POLL_INTERVAL_MS = 3000;

interface ExecuteProveWorkflowInput {
  appId: string;
  gatewayConfig: GatewayConfig;
  gatewayClient: GatewayClient;
  primusAdapter: PrimusZkTlsAdapter;
  primusTemplateResolver: PrimusTemplateResolver;
  proveInput: ProveInput;
  options?: ProveOptions;
}

export async function executeProveWorkflow(input: ExecuteProveWorkflowInput): Promise<ProveResult> {
  resolveProviderMapping(input.gatewayConfig, input.proveInput.identityPropertyId);

  const ipConfig = findIdentityPropertyConfig(
    input.gatewayConfig,
    input.proveInput.identityPropertyId
  );
  const fromConfig = cloneGatewayBusinessParamsForRequest(ipConfig?.businessParams);

  if (input.proveInput.provingParams !== undefined && !isBusinessParamsObject(input.proveInput.provingParams)) {
    return buildFailureResult(input.proveInput.clientRequestId, {
      code: "VALIDATION_ERROR",
      message: "provingParams must be a plain object when provided."
    });
  }

  const effectiveProvingParams =
    input.proveInput.provingParams !== undefined
      ? cloneGatewayBusinessParamsForRequest(input.proveInput.provingParams)
      : fromConfig;

  const proveInputForWorkflow: ProveInput = {
    ...input.proveInput,
    ...(effectiveProvingParams === undefined ? {} : { provingParams: effectiveProvingParams })
  };
  await emitProgress(input.options, {
    status: "initializing",
    clientRequestId: input.proveInput.clientRequestId
  });

  const primusIdentityPropertyId = resolvePrimusTemplateIdentityKey(
    input.gatewayConfig,
    proveInputForWorkflow.identityPropertyId
  );

  const bundle = await collectPrimusAttestationFromTemplateResolver(
    input.primusAdapter,
    input.primusTemplateResolver,
    {
      appId: input.appId,
      proveInput: {
        ...proveInputForWorkflow,
        identityPropertyId: primusIdentityPropertyId
      },
      additionParams: {
        appId: input.appId
      },
      onBeforeStartAttestation: async () => {
        await emitProgress(input.options, {
          status: "data_verifying",
          clientRequestId: input.proveInput.clientRequestId
        });
      }
    }
  );

  await emitProgress(input.options, {
    status: "proof_generating",
    clientRequestId: input.proveInput.clientRequestId
  });
  // Body field is `businessParams` (Gateway); values originate from prove.provingParams and/or /v1/config defaults.
  const createdParams = {
    appId: input.appId,
    identityPropertyId: proveInputForWorkflow.identityPropertyId,
    zkTlsProof: bundle.zkTlsProof,
    ...(effectiveProvingParams === undefined
      ? {}
      : { businessParams: effectiveProvingParams })
  };
  console.log("createProofRequest req:", createdParams);
  debugger
  const created = await input.gatewayClient.createProofRequest(createdParams);
  console.log('createProofRequest res:',created)
  if (created.error != null) {
    return buildFailureResult(
      input.proveInput.clientRequestId,
      gatewayErrorToProveError(created.error),
      created.proofRequestId
    );
  }
  console.log("pollProofRequestUntilSettled req:", created.proofRequestId);
  const status = await pollProofRequestUntilSettled(
    input.gatewayClient,
    created.proofRequestId
  );
  console.log("pollProofRequestUntilSettled res:", status);
  if (gatewayStatusIsTerminalFailure(status)) {
    await emitProgress(input.options, {
      status: "failed",
      clientRequestId: input.proveInput.clientRequestId,
      proofRequestId: created.proofRequestId
    });

    return buildFailureResult(
      input.proveInput.clientRequestId,
      resolveTerminalProofError(status),
      created.proofRequestId
    );
  }

  if (!status.walletAddress) {
    throw new SdkError("Gateway success payload is missing walletAddress.", "VALIDATION_ERROR");
  }

  const identityPropertyId = resolveProofIdentityPropertyId(status);
  if (!identityPropertyId) {
    throw new SdkError(
      "Gateway success payload is missing identity property id (`identityProperty.id` or legacy fields).",
      "VALIDATION_ERROR"
    );
  }

  const providerId =
    status.providerId?.trim() ||
    resolveProviderIdForIdentityPropertyId(input.gatewayConfig, identityPropertyId)?.trim();
  if (!providerId) {
    throw new SdkError("Gateway success payload is missing providerId.", "VALIDATION_ERROR");
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
    providerId,
    identityPropertyId,
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

/** Primus template HTTP payload may use `primusTemplateResponseKey` (PADO) while Gateway uses on-chain ids. */
function resolvePrimusTemplateIdentityKey(
  gatewayConfig: GatewayConfig,
  proveIdentityPropertyId: string
): string {
  for (const provider of gatewayConfig.providers) {
    for (const ip of provider.identityProperties) {
      if (ip.identityPropertyId === proveIdentityPropertyId) {
        return ip.primusTemplateResponseKey ?? ip.identityPropertyId;
      }
    }
  }

  return proveIdentityPropertyId;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * In-flight states per Framework: keep polling `GET /v1/proof-requests/{id}`.
 */
function gatewayStatusIsPending(status: GatewayProofRequestStatusResult["status"]): boolean {
  return status === "initialized" || status === "generating" || status === "submitting";
}

async function pollProofRequestUntilSettled(
  gatewayClient: GatewayClient,
  proofRequestId: string
): Promise<GatewayProofRequestStatusResult> {
  for (;;) {
    const status = await gatewayClient.getProofRequestStatus(proofRequestId);

    if (gatewayStatusIsTerminalFailure(status)) {
      return status;
    }

    if (gatewayStatusIsOnChainAttested(status.status)) {
      return status;
    }

    if (gatewayStatusIsPending(status.status)) {
      await delay(PROOF_REQUEST_POLL_INTERVAL_MS);
      continue;
    }

    throw new SdkError("Gateway returned an unexpected proof request status.", "VALIDATION_ERROR", {
      status: status.status,
      proofRequestId
    });
  }
}

function gatewayStatusIsOnChainAttested(
  status: GatewayProofRequestStatusResult["status"]
): boolean {
  return status === "onchain_attested" || status === "on_chain_attested";
}

function gatewayStatusIsTerminalFailure(status: GatewayProofRequestStatusResult): boolean {
  if (status.error != null) {
    return true;
  }
  if (status.failure != null) {
    return true;
  }

  const s = status.status;
  return (
    s === "failed" ||
    s === "prover_failed" ||
    s === "packaging_failed" ||
    s === "submission_failed" ||
    s === "internal_error"
  );
}

function resolveProofIdentityPropertyId(status: GatewayProofRequestStatusResult): string | undefined {
  const fromNested = status.identityProperty?.id?.trim() || status.identityProperty?.identityPropertyId?.trim();
  if (fromNested) {
    return fromNested;
  }
  return status.identityPropertyId?.trim();
}

function failureDetailToError(failure: GatewayProofFailure | Record<string, unknown>): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (
    typeof failure === "object" &&
    failure !== null &&
    "reason" in failure &&
    "detail" in failure &&
    typeof (failure as GatewayProofFailure).reason === "string" &&
    typeof (failure as GatewayProofFailure).detail === "string"
  ) {
    const f = failure as GatewayProofFailure;
    return { code: f.reason, message: f.detail, details: failure as Record<string, unknown> };
  }

  const f = failure as Record<string, unknown>;
  const code = typeof f.code === "string" ? f.code : "PROOF_REQUEST_FAILED";
  const message =
    typeof f.message === "string" ? f.message : "Gateway reported proof lifecycle failure.";
  return { code, message, details: f };
}

function gatewayErrorToProveError(err: {
  category?: string;
  code: string;
  message?: string;
  detail?: string;
  details?: Record<string, unknown>;
}): { code: string; message: string; details?: Record<string, unknown> } {
  const message = err.detail ?? err.message ?? err.code;
  const details = {
    ...err.details,
    ...(err.category !== undefined ? { category: err.category } : {})
  };
  const hasDetails = Object.keys(details).length > 0;
  return {
    code: err.code,
    message,
    ...(hasDetails ? { details } : {})
  };
}

function resolveTerminalProofError(status: GatewayProofRequestStatusResult): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (status.error != null) {
    return gatewayErrorToProveError(status.error);
  }

  if (status.failure != null) {
    return failureDetailToError(status.failure);
  }

  return {
    code: "PROOF_REQUEST_FAILED",
    message: "Gateway returned a failed proof request."
  };
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
