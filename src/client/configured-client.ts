import {
  bnbZkIdErrorFromPrimusInitFailure,
  createBnbZkIdProveError,
  createProveBeforeInitError,
  getDefaultProveErrorMessage,
  INIT_FAILURE_REASON_APP_ID_NOT_ENABLED,
  INIT_FAILURE_REASON_TEMPLATE_RESOLVE,
  serializeErrorForProveDetails
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
  InitResult,
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

  async init(input: InitInput): Promise<InitResult> {
    assertInitInputValidOrThrow(input);
    const appId = input.appId.trim();
    const [gatewayConfig, providers] = await Promise.all([
      this.options.gatewayClient.getConfig(),
      this.options.gatewayClient.getConfigProvidersWire()
    ]);

    if (gatewayConfig.appIds.length > 0 && !gatewayConfig.appIds.includes(appId)) {
      return {
        success: false,
        error: {
          code: "00001",
          message: getDefaultProveErrorMessage("00001"),
          details: {
            reason: INIT_FAILURE_REASON_APP_ID_NOT_ENABLED,
            appId
          }
        }
      };
    }

    let primusAppConfig;
    try {
      primusAppConfig = await this.options.primusTemplateResolver.resolveAppConfig({
        appId
      });
    } catch (err) {
      return {
        success: false,
        error: {
          code: "00001",
          message: getDefaultProveErrorMessage("00001"),
          details: {
            reason: INIT_FAILURE_REASON_TEMPLATE_RESOLVE,
            cause: serializeErrorForProveDetails(err)
          }
        }
      };
    }
    try {
      await this.options.primusAdapter.init(primusAppConfig.zktlsAppId);
    } catch (err) {
      return {
        success: false,
        error: bnbZkIdErrorFromPrimusInitFailure(err)
      };
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
    if (!this.initializedAppId || !this.gatewayConfig || !this.gatewayConfigProvidersWire) {
      const err = createProveBeforeInitError(input.clientRequestId);
      await options?.onProgress?.({
        status: "failed",
        clientRequestId: err.clientRequestId ?? input.clientRequestId.trim()
      });
      throw err;
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
