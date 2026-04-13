import {
  BnbZkIdProveError,
  createBnbZkIdProveError,
  outerProveCodeForPrimusProveFailure,
  serializeErrorForProveDetails,
  serializePrimusStageDetails
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
  GatewayCreateProofRequestResult,
  GatewayProofFailure,
  GatewayProofRequestStatusResult
} from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { collectPrimusAttestationFromTemplateResolver } from "./collect-primus-attestation-from-resolver.js";
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
  proveInput: ProveInput;
  options?: ProveOptions;
}

function proveErrorContext(
  clientRequestId: string,
  proofRequestId?: string
): { clientRequestId: string; proofRequestId?: string } {
  return proofRequestId !== undefined
    ? { clientRequestId, proofRequestId }
    : { clientRequestId };
}

function brevisDetails(inner: Record<string, unknown>): Record<string, unknown> {
  return { brevis: inner };
}

/** `POST /v1/proof-requests` Framework `error` → `BnbZkIdProveError.details.brevis` (aligned with GET query failures). */
function brevisDetailsFromCreateProofRequest(
  created: GatewayCreateProofRequestResult
): Record<string, unknown> {
  if (created.error == null) {
    throw new Error("brevisDetailsFromCreateProofRequest requires created.error.");
  }
  return {
    phase: "createProofRequest",
    ...flatDetailsFromFrameworkError(created.error),
    ...(created.httpRequest !== undefined
      ? {
          httpStatus: created.httpRequest.httpStatus,
          pathname: created.httpRequest.pathname,
          url: created.httpRequest.url
        }
      : {})
  };
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

    try {
      resolveProviderMapping(input.gatewayConfig, input.proveInput.identityPropertyId);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw createBnbZkIdProveError(
          "00007",
          {
            message: "identityPropertyId is not listed in init().providers[].properties[].id.",
            field: "identityPropertyId"
          },
          { clientRequestId }
        );
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
        },
        ...(input.options?.closeDataSourceOnProofComplete === undefined
          ? {}
          : {
              closeDataSourceOnProofComplete: input.options.closeDataSourceOnProofComplete
            })
      }
    );
  } catch (error) {
    const outer = outerProveCodeForPrimusProveFailure(error);
    throw createBnbZkIdProveError(
      outer,
      { primus: serializePrimusStageDetails(error) },
      { clientRequestId }
    );
  }

  await emitProgress(input.options, {
    status: "proof_generating",
    clientRequestId
  });

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
    throw createBnbZkIdProveError(
      "10003",
      brevisDetails({
        phase: "createProofRequest",
        cause: serializeErrorForProveDetails(error)
      }),
      { clientRequestId }
    );
  }

  const proofRequestIdAfterCreate =
    created.proofRequestId.trim() !== "" ? created.proofRequestId : undefined;

  if (created.error != null) {
    const isBindingConflict = created.error.category === "binding_conflict";
    throw createBnbZkIdProveError(
      isBindingConflict ? "10001" : "10003",
      brevisDetails(brevisDetailsFromCreateProofRequest(created)),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

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
      throw createBnbZkIdProveError(
        "10003",
        brevisDetails({
          code: error.code,
          message: error.message,
          phase: "pollProofRequest",
          maxDurationMs: error.maxDurationMs,
          elapsedMs: error.elapsedMs
        }),
        proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
      );
    }
    if (error instanceof SdkError && error.code === GATEWAY_API_ERROR_CODE && error.details !== undefined) {
      throw createBnbZkIdProveError(
        "10003",
        brevisDetails({
          ...error.details
        }),
        proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
      );
    }
    throw createBnbZkIdProveError(
      "10003",
      brevisDetails({
        phase: "pollProofRequest",
        cause: serializeErrorForProveDetails(error)
      }),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  if (gatewayStatusIsTerminalFailure(status)) {
    const zkVmCode = status.status === "submission_failed" ? "10002" : "10003";
    throw createBnbZkIdProveError(
      zkVmCode,
      brevisDetails(brevisDetailsFromPollTerminalStatus(status)),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  if (!status.walletAddress) {
    throw createBnbZkIdProveError(
      "10003",
      brevisDetails({
        phase: "gateway_payload",
        reason: "Gateway success payload is missing walletAddress."
      }),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  const identityPropertyId = resolveProofIdentityPropertyId(status);
  if (!identityPropertyId) {
    throw createBnbZkIdProveError(
      "10003",
      brevisDetails({
        phase: "gateway_payload",
        reason:
          "Gateway success payload is missing identity property id (`identityProperty.id` or legacy fields)."
      }),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  const providerId =
    status.providerId?.trim() ||
    resolveProviderIdForIdentityPropertyId(input.gatewayConfig, identityPropertyId)?.trim();
  if (!providerId) {
    throw createBnbZkIdProveError(
      "10003",
      brevisDetails({
        phase: "gateway_payload",
        reason: "Gateway success payload is missing providerId."
      }),
      proveErrorContext(clientRequestId, proofRequestIdAfterCreate)
    );
  }

  await emitProgress(input.options, {
    status: "on_chain_attested",
    clientRequestId,
    ...(proofRequestIdAfterCreate !== undefined ? { proofRequestId: proofRequestIdAfterCreate } : {})
  });

  return {
    status: "on_chain_attested",
    clientRequestId,
    walletAddress: status.walletAddress,
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

    if (gatewayStatusIsOnChainAttested(status.status)) {
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

function gatewayStatusIsOnChainAttested(
  status: GatewayProofRequestStatusResult["status"]
): boolean {
  return status === "onchain_attested" || status === "on_chain_attested";
}

function gatewayStatusIsTerminalFailure(status: GatewayProofRequestStatusResult): boolean {
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
  const fromNested =
    status.identityProperty?.id?.trim() || status.identityProperty?.identityPropertyId?.trim();
  if (fromNested) {
    return fromNested;
  }
  return status.identityPropertyId?.trim();
}

/** `GET /v1/proof-requests/{id}` terminal payload → `details.brevis` inner object (always includes wire `status`). */
function brevisDetailsFromPollTerminalStatus(
  status: GatewayProofRequestStatusResult
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    phase: "pollProofRequestTerminal",
    status: status.status
  };

  if (status.failure != null) {
    out.failure = normalizeGatewayFailureForBrevis(status.failure);
    return out;
  }

  out.code = "PROOF_REQUEST_FAILED";
  out.message = "Gateway reported a failed proof request.";
  return out;
}

function normalizeGatewayFailureForBrevis(
  failure: GatewayProofFailure | Record<string, unknown>
): { reason: string; detail: string } {
  if (
    typeof failure === "object" &&
    failure !== null &&
    typeof (failure as GatewayProofFailure).reason === "string" &&
    typeof (failure as GatewayProofFailure).detail === "string"
  ) {
    const f = failure as GatewayProofFailure;
    return { reason: f.reason, detail: f.detail };
  }

  const f = failure as Record<string, unknown>;
  const reason = typeof f.reason === "string" ? f.reason : "PROOF_REQUEST_FAILED";
  const detail =
    typeof f.detail === "string"
      ? f.detail
      : typeof f.message === "string"
        ? f.message
        : "Gateway reported proof lifecycle failure.";
  return { reason, detail };
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
    clientRequestId,
    ...(err.proofRequestId !== undefined ? { proofRequestId: err.proofRequestId } : {})
  });
}

async function emitProgress(
  options: ProveOptions | undefined,
  event: ProveProgressEvent
): Promise<void> {
  await options?.onProgress?.(event);
}
