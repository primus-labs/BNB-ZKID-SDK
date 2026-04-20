import {
  BnbZkIdProveError,
  createBnbZkIdProveError,
  getInvalidIdentityPropertyIdMessage,
  isNetworkLikeError,
  resolvePrimusStageErrorFromUnknown
} from "../errors/prove-error.js";
import { ConfigurationError, GATEWAY_API_ERROR_CODE, SdkError } from "../errors/sdk-error.js";
import { cloneGatewayBusinessParamsForRequest } from "../gateway/business-params.js";
import { flatDetailsFromFrameworkError } from "../gateway/framework-error-flat.js";
import {
  findIdentityPropertyConfig,
  resolveProviderIdForIdentityPropertyId
} from "../gateway/status-identity.js";
import {
  PROOF_REQUEST_POLL_INTERVAL_MS,
  PROOF_REQUEST_POLL_MAX_DURATION_MS
} from "../config/proof-request-polling.js";
import { ProofRequestPollTimeoutError } from "../errors/proof-request-poll-timeout-error.js";
import type {
  GatewayClient,
  GatewayConfig,
  GatewayProofRequestStatusResult
} from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import type { WhitelistChecker, WhitelistCheckResponse } from "../whitelist/checker.js";
import { collectPrimusAttestationFromTemplateResolver } from "./collect-primus-attestation-from-resolver.js";
import {
  classifyGatewayApiDetailsError,
  classifyGatewayThrownError,
  classifyGatewayTerminalFailureCode,
  isGatewayStatusOnChainAttested,
  isGatewayStatusTerminalFailure
} from "./gateway-error-mapping.js";
import { normalizeGatewayAttestedStatusOrThrow } from "./gateway-success-normalizer.js";
import { assertProveInputValidOrThrow } from "../validation/public-input-validation.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import type {
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProvingParams,
  ProveSuccessResult
} from "../types/public.js";

interface ExecuteProveWorkflowInput {
  appId: string;
  gatewayConfig: GatewayConfig;
  configProvidersWire: BnbZkIdGatewayConfigProviderWire[];
  gatewayClient: GatewayClient;
  primusAdapter: PrimusZkTlsAdapter;
  primusTemplateResolver: PrimusTemplateResolver;
  whitelistChecker: WhitelistChecker;
  proveInput: ProveInput;
  options?: ProveOptions;
}

function proveErrorContext(
  clientRequestId: string,
  proofRequestId?: string
): { clientRequestId: string; proofRequestId?: string } {
  return {
    clientRequestId,
    ...(proofRequestId !== undefined ? { proofRequestId } : {})
  };
}

async function checkWhitelistOrThrow(input: {
  whitelistChecker: WhitelistChecker;
  userAddress: string;
  sourceAppId: string;
  clientRequestId: string;
}): Promise<void> {
  let payload: WhitelistCheckResponse;
  try {
    payload = await input.whitelistChecker.check({
      address: input.userAddress,
      sourceAppId: input.sourceAppId
    });
  } catch (error) {
    if (isNetworkLikeError(error)) {
      throw createBnbZkIdProveError("30004", { clientRequestId: input.clientRequestId });
    }
    throw error;
  }

  if (payload.rc === 0 && payload.result === true) {
    return;
  }
  if (payload.rc === 0 && payload.result === false) {
    throw createBnbZkIdProveError("00006", { clientRequestId: input.clientRequestId });
  }
}

export async function executeProveWorkflow(
  input: ExecuteProveWorkflowInput
): Promise<ProveSuccessResult> {
  const progressClientRequestIdFallback =
    typeof input.proveInput.clientRequestId === "string"
      ? input.proveInput.clientRequestId.trim()
      : "";

  try {
    assertProveInputValidOrThrow(input.proveInput, input.configProvidersWire);
    const clientRequestId = input.proveInput.clientRequestId.trim();
    await checkWhitelistOrThrow({
      whitelistChecker: input.whitelistChecker,
      userAddress: input.proveInput.userAddress,
      sourceAppId: input.appId,
      clientRequestId
    });

    try {
      resolveProviderMapping(input.gatewayConfig, input.proveInput.identityPropertyId);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw createBnbZkIdProveError("00004", {
          clientRequestId,
          messageOverride: getInvalidIdentityPropertyIdMessage("not_supported")
        });
      }
      throw error;
    }

  const ipConfig = findIdentityPropertyConfig(
    input.gatewayConfig,
    input.proveInput.identityPropertyId
  );
  const fromConfig = cloneGatewayBusinessParamsForRequest(ipConfig?.businessParams);

  const userProvingParams = input.proveInput.provingParams;
  const explicitBusinessParams = userProvingParams?.businessParams;

  const resolvedBusiness =
    explicitBusinessParams !== undefined
      ? cloneGatewayBusinessParamsForRequest(explicitBusinessParams)
      : fromConfig;

  let workflowProvingParams: ProvingParams | undefined;
  if (userProvingParams !== undefined) {
    workflowProvingParams = {
      ...userProvingParams,
      ...(resolvedBusiness === undefined ? {} : { businessParams: resolvedBusiness })
    };
  } else if (resolvedBusiness !== undefined) {
    workflowProvingParams = { businessParams: resolvedBusiness };
  } else {
    workflowProvingParams = undefined;
  }

  const proveInputForWorkflow: ProveInput = {
    ...input.proveInput,
    ...(workflowProvingParams === undefined ? {} : { provingParams: workflowProvingParams })
  };

  await emitProgress(input.options, {
    status: "initializing",
    clientRequestId
  });

  const primusIdentityPropertyId = resolvePrimusTemplateIdentityKey(
    input.gatewayConfig,
    proveInputForWorkflow.identityPropertyId
  );

  let bundle;
  try {
    bundle = await collectPrimusAttestationFromTemplateResolver(
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
            clientRequestId
          });
        }
      }
    );
  } catch (error) {
    if (isNetworkLikeError(error)) {
      throw createBnbZkIdProveError("30004", { clientRequestId });
    }
    const primusError = resolvePrimusStageErrorFromUnknown(error);
    throw createBnbZkIdProveError(primusError.code, {
      clientRequestId,
      messageOverride: primusError.message
    });
  }

  const createdParams = {
    appId: input.appId,
    identityPropertyId: proveInputForWorkflow.identityPropertyId,
    zkTlsProof: bundle.zkTlsProof,
    ...(resolvedBusiness === undefined ? {} : { businessParams: resolvedBusiness })
  };

  let created;
  try {
    created = await input.gatewayClient.createProofRequest(createdParams);
  } catch (error) {
    throw createBnbZkIdProveError(classifyGatewayThrownError(error), { clientRequestId });
  }

  const proofRequestIdAfterCreate =
    created.proofRequestId.trim() !== "" ? created.proofRequestId : undefined;

  if (created.error != null) {
    const isBindingConflict = created.error.category === "binding_conflict";
    throw createBnbZkIdProveError(
      isBindingConflict ? "30001" : "30002",
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  await emitProgress(input.options, {
    status: "proof_generating",
    clientRequestId,
    ...(proofRequestIdAfterCreate !== undefined ? { proofRequestId: proofRequestIdAfterCreate } : {})
  });

  let status: GatewayProofRequestStatusResult;
  try {
    status = await pollProofRequestUntilSettled(
      input.gatewayClient,
      created.proofRequestId,
      {
        pollIntervalMs: PROOF_REQUEST_POLL_INTERVAL_MS,
        maxDurationMs: PROOF_REQUEST_POLL_MAX_DURATION_MS
      }
    );
  } catch (error) {
    if (error instanceof ProofRequestPollTimeoutError) {
      throw createBnbZkIdProveError("30005", proveErrorContext(clientRequestId, proofRequestIdAfterCreate));
    }
    if (error instanceof SdkError && error.code === GATEWAY_API_ERROR_CODE && error.details !== undefined) {
      const details = error.details as Record<string, unknown>;
      throw createBnbZkIdProveError(
        classifyGatewayApiDetailsError(details),
        proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
      );
    }
    throw createBnbZkIdProveError(
      classifyGatewayThrownError(error),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  if (gatewayStatusIsTerminalFailure(status)) {
    const zkVmCode = classifyGatewayTerminalFailureCode(status.status);
    throw createBnbZkIdProveError(zkVmCode, proveErrorContext(clientRequestId, proofRequestIdAfterCreate));
  }

  let normalized;
  try {
    normalized = normalizeGatewayAttestedStatusOrThrow(status);
  } catch {
    throw createBnbZkIdProveError("30002", proveErrorContext(clientRequestId, proofRequestIdAfterCreate));
  }

  const identityPropertyId = normalized.identityPropertyId;
  const providerId =
    normalized.providerId ||
    resolveProviderIdForIdentityPropertyId(input.gatewayConfig, identityPropertyId)?.trim();
  if (!providerId) {
    throw createBnbZkIdProveError("30002", proveErrorContext(clientRequestId, proofRequestIdAfterCreate));
  }

  await emitProgress(input.options, {
    status: "on_chain_attested",
    clientRequestId,
    ...(proofRequestIdAfterCreate !== undefined ? { proofRequestId: proofRequestIdAfterCreate } : {})
  });

  return {
    status: "on_chain_attested",
    clientRequestId,
    walletAddress: normalized.walletAddress,
    providerId,
    identityPropertyId,
    ...(proofRequestIdAfterCreate !== undefined ? { proofRequestId: proofRequestIdAfterCreate } : {})
  };
  } catch (error) {
    if (error instanceof BnbZkIdProveError) {
      await emitProgressFailedForProve(input.options, error, progressClientRequestIdFallback);
      throw error;
    }
    await emitProgress(input.options, {
      status: "failed",
      clientRequestId: progressClientRequestIdFallback
    });
    throw error;
  }
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
  proofRequestId: string,
  timing: { pollIntervalMs: number; maxDurationMs: number }
): Promise<GatewayProofRequestStatusResult> {
  const startedAt = Date.now();

  for (;;) {
    if (Date.now() - startedAt > timing.maxDurationMs) {
      throw new ProofRequestPollTimeoutError(
        proofRequestId,
        timing.maxDurationMs,
        Date.now() - startedAt
      );
    }

    const status = await gatewayClient.getProofRequestStatus(proofRequestId);

    if (status.error != null) {
      throw new SdkError("Gateway proof request query failed.", GATEWAY_API_ERROR_CODE, {
        phase: "getProofRequestStatus",
        status: status.status,
        ...flatDetailsFromFrameworkError(status.error)
      });
    }

    if (gatewayStatusIsTerminalFailure(status)) {
      return status;
    }

    if (isGatewayStatusOnChainAttested(status.status)) {
      return status;
    }

    if (gatewayStatusIsPending(status.status)) {
      await delay(timing.pollIntervalMs);
      continue;
    }

    throw new SdkError("Gateway returned an unexpected proof request status.", "VALIDATION_ERROR", {
      status: status.status,
      proofRequestId
    });
  }
}

function gatewayStatusIsTerminalFailure(status: GatewayProofRequestStatusResult): boolean {
  if (status.failure != null) {
    return true;
  }
  return isGatewayStatusTerminalFailure(status.status);
}

/** Invoked for every `prove` failure path so `onProgress` can observe `status: "failed"`. */
async function emitProgressFailedForProve(
  options: ProveOptions | undefined,
  err: BnbZkIdProveError,
  fallbackClientRequestId: string
): Promise<void> {
  const clientRequestId = err.clientRequestId ?? fallbackClientRequestId;
  await emitProgress(options, {
    status: "failed",
    clientRequestId
  });
}

async function emitProgress(
  options: ProveOptions | undefined,
  event: ProveProgressEvent
): Promise<void> {
  await options?.onProgress?.(event);
}
