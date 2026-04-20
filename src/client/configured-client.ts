import {
  createBnbZkIdProveError,
  getInvalidAppIdMessage,
  isNetworkLikeError
} from "../errors/prove-error.js";
import { GATEWAY_API_ERROR_CODE, SdkError } from "../errors/sdk-error.js";
import { INTERNAL_BNB_ZKID_CONFIG } from "../config/internal-config.js";
import type { BnbZkIdGatewayConfigProviderWire } from "../types/gateway-config-wire.js";
import type { GatewayClient, GatewayConfig } from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { assertInitInputValidOrThrow } from "../validation/public-input-validation.js";
import { executeProveWorkflow } from "../workflow/execute-prove.js";
import {
  classifyGatewayApiDetailsError,
  classifyGatewayTerminalFailureCode,
  isGatewayStatusOnChainAttested,
  isGatewayStatusTerminalFailure
} from "../workflow/gateway-error-mapping.js";
import { normalizeGatewayAttestedStatusOrThrow } from "../workflow/gateway-success-normalizer.js";
import { createHttpWhitelistChecker, type WhitelistChecker } from "../whitelist/checker.js";
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
  whitelistChecker?: WhitelistChecker;
}

const defaultWhitelistChecker = createHttpWhitelistChecker({
  baseUrl: INTERNAL_BNB_ZKID_CONFIG.primus.whitelist?.baseUrl ?? "",
  checkPath: INTERNAL_BNB_ZKID_CONFIG.primus.whitelist?.checkPath ?? "/public/zkid/whitelist/check"
});

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
        throw createBnbZkIdProveError("30004");
      }
      throw error;
    }

    if (gatewayConfig.appIds.length > 0 && !gatewayConfig.appIds.includes(appId)) {
      throw createBnbZkIdProveError("00003", {
        messageOverride: getInvalidAppIdMessage("not_enabled")
      });
    }

    try {
      const primusAppConfig = await this.options.primusTemplateResolver.resolveAppConfig({
        appId
      });
      await this.options.primusAdapter.init(primusAppConfig.zktlsAppId);
    } catch (error) {
      if (isNetworkLikeError(error)) {
        throw createBnbZkIdProveError("30004");
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
      throw createBnbZkIdProveError("00001", {
        ...(typeof input.clientRequestId === "string" && input.clientRequestId.trim() !== ""
          ? { clientRequestId: input.clientRequestId.trim() }
          : {})
      });
    }

    return executeProveWorkflow({
      appId: this.initializedAppId,
      gatewayConfig: this.gatewayConfig,
      configProvidersWire: this.gatewayConfigProvidersWire,
      gatewayClient: this.options.gatewayClient,
      primusAdapter: this.options.primusAdapter,
      primusTemplateResolver: this.options.primusTemplateResolver,
      whitelistChecker: this.options.whitelistChecker ?? defaultWhitelistChecker,
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
    const errorContext = {
      ...(clientRequestId === undefined ? {} : { clientRequestId }),
      ...(proofRequestId === "" ? {} : { proofRequestId })
    };

    if (proofRequestId === "") {
      throw createBnbZkIdProveError("00007", clientRequestId === undefined ? undefined : { clientRequestId });
    }

    let status;
    try {
      status = await this.options.gatewayClient.getProofRequestStatus(proofRequestId);
    } catch (error) {
      if (isNetworkLikeError(error)) {
        throw createBnbZkIdProveError("30004", errorContext);
      }
      if (error instanceof SdkError && error.code === GATEWAY_API_ERROR_CODE && error.details !== undefined) {
        const details = error.details as Record<string, unknown>;
        throw createBnbZkIdProveError(classifyGatewayApiDetailsError(details), errorContext);
      }
      throw createBnbZkIdProveError("30002", errorContext);
    }

    if (status.error != null) {
      const frameworkDetails = { ...status.error } as Record<string, unknown>;
      throw createBnbZkIdProveError(classifyGatewayApiDetailsError(frameworkDetails), errorContext);
    }

    if (isGatewayStatusTerminalFailure(status.status)) {
      throw createBnbZkIdProveError(classifyGatewayTerminalFailureCode(status.status), errorContext);
    }

    if (!isGatewayStatusOnChainAttested(status.status)) {
      throw createBnbZkIdProveError("30002", errorContext);
    }
    let normalized;
    try {
      normalized = normalizeGatewayAttestedStatusOrThrow(status);
    } catch {
      throw createBnbZkIdProveError("30002", errorContext);
    }

    return {
      status: "on_chain_attested",
      walletAddress: normalized.walletAddress,
      providerId: normalized.providerId,
      identityPropertyId: normalized.identityPropertyId,
      ...(normalized.proofRequestId !== undefined ? { proofRequestId: normalized.proofRequestId } : {}),
      ...(clientRequestId !== undefined ? { clientRequestId } : {})
    };
  }
}

export function createConfiguredBnbZkIdClient(
  options: ConfiguredBnbZkIdClientOptions
): BnbZkIdClientMethods {
  return new ConfiguredBnbZkIdClient(options);
}
