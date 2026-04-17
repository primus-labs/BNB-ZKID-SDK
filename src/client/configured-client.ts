import {
  createBnbZkIdProveError,
  getInvalidAppIdMessage,
  isNetworkLikeError
} from "../errors/prove-error.js";
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
  ProveSuccessResult
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
}

export function createConfiguredBnbZkIdClient(
  options: ConfiguredBnbZkIdClientOptions
): BnbZkIdClientMethods {
  return new ConfiguredBnbZkIdClient(options);
}
