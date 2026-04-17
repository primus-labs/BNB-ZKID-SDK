import {
  createBnbZkIdProveError,
  getInvalidAppIdMessage,
  isNetworkLikeError
} from "../errors/prove-error.js";
import { GATEWAY_API_ERROR_CODE, SdkError } from "../errors/sdk-error.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import type { GatewayClient, GatewayConfig } from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { assertInitInputValidOrThrow } from "../validation/public-input-validation.js";
import { executeProveWorkflow } from "../workflow/execute-prove.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitSuccessResult,
  ProveInput,
  ProveOptions,
  ProveSuccessResult,
  QueryProofResultInput,
  QueryProofResultSuccessResult
} from "../types/public.js";

export interface ConfiguredBnbZkIdClientOptions {
  gatewayClient: GatewayClient;
  primusAdapter: PrimusZkTlsAdapter;
  primusTemplateResolver: PrimusTemplateResolver;
}

class ConfiguredBnbZkIdClient implements BnbZkIdClientMethods {
  private initializedAppId: string | undefined;
  private gatewayConfig: GatewayConfig | undefined;
  private gatewayConfigProvidersWire: BnbZkIdGatewayConfigProviderWire[] | undefined;

  constructor(private readonly options: ConfiguredBnbZkIdClientOptions) {}

  async init(input: InitInput): Promise<InitSuccessResult> {
    assertInitInputValidOrThrow(input);
    const appId = input.appId.trim();
    let gatewayConfig: GatewayConfig;
    let providers: BnbZkIdGatewayConfigProviderWire[];
    try {
      [gatewayConfig, providers] = await Promise.all([
        this.options.gatewayClient.getConfig(),
        this.options.gatewayClient.getConfigProvidersWire()
      ]);
    } catch (error) {
      if (isNetworkLikeError(error)) {
        throw createBnbZkIdProveError("30004", {});
      }
      throw error;
    }

    if (gatewayConfig.appIds.length > 0 && !gatewayConfig.appIds.includes(appId)) {
      throw createBnbZkIdProveError(
        "00003",
        {},
        {
          messageOverride: getInvalidAppIdMessage("not_enabled")
        }
      );
    }

    try {
      const primusAppConfig = await this.options.primusTemplateResolver.resolveAppConfig({
        appId
      });
      await this.options.primusAdapter.init(primusAppConfig.zktlsAppId);
    } catch (error) {
      if (isNetworkLikeError(error)) {
        throw createBnbZkIdProveError("30004", {});
      }
      throw error;
    }
    this.initializedAppId = appId;
    this.gatewayConfig = gatewayConfig;
    this.gatewayConfigProvidersWire = providers;

    return {
      success: true,
      providers
    };
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult> {
    if (
      this.initializedAppId === undefined ||
      this.gatewayConfig === undefined ||
      this.gatewayConfigProvidersWire === undefined
    ) {
      throw createBnbZkIdProveError(
        "00001",
        {
          message: "init() must succeed before prove().",
          field: "init"
        },
        {
          ...(typeof input.clientRequestId === "string" && input.clientRequestId.trim() !== ""
            ? { clientRequestId: input.clientRequestId.trim() }
            : {})
        }
      );
    }

    return executeProveWorkflow({
      appId: this.initializedAppId,
      gatewayConfig: this.gatewayConfig,
      configProvidersWire: this.gatewayConfigProvidersWire,
      gatewayClient: this.options.gatewayClient,
      primusAdapter: this.options.primusAdapter,
      primusTemplateResolver: this.options.primusTemplateResolver,
      proveInput: input,
      ...(options === undefined ? {} : { options })
    });
  }

  async queryProofResult(input: QueryProofResultInput): Promise<QueryProofResultSuccessResult> {
    const proofRequestId = input.proofRequestId.trim();
    const clientRequestId =
      typeof input.clientRequestId === "string" && input.clientRequestId.trim() !== ""
        ? input.clientRequestId.trim()
        : undefined;
    const errorContext = clientRequestId === undefined ? undefined : { clientRequestId };

    if (proofRequestId === "") {
      throw createBnbZkIdProveError("00007", { field: "proofRequestId" }, errorContext);
    }

    let status;
    try {
      status = await this.options.gatewayClient.getProofRequestStatus(proofRequestId);
    } catch (error) {
      if (isNetworkLikeError(error)) {
        throw createBnbZkIdProveError("30004", {}, errorContext);
      }
      if (error instanceof SdkError && error.code === GATEWAY_API_ERROR_CODE && error.details !== undefined) {
        const details = error.details as Record<string, unknown>;
        throw createBnbZkIdProveError(classifyGatewayApiDetailsError(details), { brevis: details }, errorContext);
      }
      throw createBnbZkIdProveError("30002", { cause: String(error) }, errorContext);
    }

    if (status.error != null) {
      const frameworkDetails = { ...status.error } as Record<string, unknown>;
      throw createBnbZkIdProveError(
        classifyGatewayApiDetailsError(frameworkDetails),
        { brevis: frameworkDetails },
        errorContext
      );
    }

    if (gatewayStatusIsTerminalFailure(status.status)) {
      throw createBnbZkIdProveError(classifyGatewayTerminalFailureCode(status.status), {}, errorContext);
    }

    if (!gatewayStatusIsOnChainAttested(status.status)) {
      throw createBnbZkIdProveError("30002", { status: status.status }, errorContext);
    }
    if (!status.walletAddress) {
      throw createBnbZkIdProveError("30002", { reason: "missing walletAddress" }, errorContext);
    }

    const identityPropertyId =
      status.identityProperty?.id?.trim() ||
      status.identityProperty?.identityPropertyId?.trim() ||
      status.identityPropertyId?.trim();
    if (!identityPropertyId) {
      throw createBnbZkIdProveError("30002", { reason: "missing identityPropertyId" }, errorContext);
    }

    const providerId = status.providerId?.trim();
    if (!providerId) {
      throw createBnbZkIdProveError("30002", { reason: "missing providerId" }, errorContext);
    }

    return {
      status: "on_chain_attested",
      walletAddress: status.walletAddress,
      providerId,
      identityPropertyId,
      ...(status.proofRequestId?.trim() ? { proofRequestId: status.proofRequestId.trim() } : {}),
      ...(clientRequestId !== undefined ? { clientRequestId } : {})
    };
  }
}

function gatewayStatusIsOnChainAttested(status: string): boolean {
  return status === "onchain_attested" || status === "on_chain_attested";
}

function gatewayStatusIsTerminalFailure(status: string): boolean {
  return (
    status === "failed" ||
    status === "prover_failed" ||
    status === "packaging_failed" ||
    status === "submission_failed" ||
    status === "internal_error"
  );
}

function classifyGatewayTerminalFailureCode(status: string): "30003" | "40000" | "30002" {
  if (status === "internal_error") {
    return "30003";
  }
  if (status === "submission_failed") {
    return "40000";
  }
  return "30002";
}

function classifyGatewayApiDetailsError(details: Record<string, unknown>): "30001" | "30003" | "30002" {
  if (details.category === "binding_conflict") {
    return "30001";
  }
  if (details.status === "internal_error") {
    return "30003";
  }
  return "30002";
}

export function createConfiguredBnbZkIdClient(
  options: ConfiguredBnbZkIdClientOptions
): BnbZkIdClientMethods {
  return new ConfiguredBnbZkIdClient(options);
}
