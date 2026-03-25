import type { GatewayClient, GatewayConfig } from "../gateway/types.js";
import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusZkTlsAdapter } from "../primus/types.js";
import { executeProveWorkflow } from "../workflow/execute-prove.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitResult,
  ProveInput,
  ProveOptions,
  ProveResult
} from "../types/public.js";

export interface ConfiguredBnbZkIdClientOptions {
  gatewayClient: GatewayClient;
  primusAdapter: PrimusZkTlsAdapter;
  primusTemplateResolver: PrimusTemplateResolver;
}

class ConfiguredBnbZkIdClient implements BnbZkIdClientMethods {
  private initializedAppId: string | undefined;
  private gatewayConfig: GatewayConfig | undefined;

  constructor(private readonly options: ConfiguredBnbZkIdClientOptions) {}

  async init(input: InitInput): Promise<InitResult> {
    const appId = input.appId.trim();
    const gatewayConfig = await this.options.gatewayClient.getConfig();

    if (appId.length === 0) {
      return {
        success: false,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "appId is required."
        }
      };
    }

    if (!gatewayConfig.appIds.includes(appId)) {
      return {
        success: false,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "appId is not enabled by the Gateway config.",
          details: { appId }
        }
      };
    }

    await this.options.primusAdapter.init();
    this.initializedAppId = appId;
    this.gatewayConfig = gatewayConfig;

    return {
      success: true
    };
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult> {
    if (!this.initializedAppId || !this.gatewayConfig) {
      return {
        status: "failed",
        clientRequestId: input.clientRequestId,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "init must succeed before prove can run."
        }
      };
    }

    return executeProveWorkflow({
      appId: this.initializedAppId,
      gatewayConfig: this.gatewayConfig,
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
