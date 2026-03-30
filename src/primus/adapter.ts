import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import { loadPrimusZkTlsRuntime } from "./load-runtime.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAttestationBundle,
  PrimusRequestSigner,
  PrimusZkTlsAdapter,
  PrimusZkTlsAdapterConfig,
  PrimusZkTlsRuntime
} from "./types.js";

class DefaultPrimusZkTlsAdapter implements PrimusZkTlsAdapter {
  private runtimePromise: Promise<PrimusZkTlsRuntime> | undefined;
  private initialized = false;
  private initializedAppId: string | undefined;

  constructor(private readonly config: PrimusZkTlsAdapterConfig) {}

  async init(appId?: string): Promise<string | boolean> {
    const resolvedAppId = this.resolveAppId(appId);
    if (this.initialized) {
      if (this.initializedAppId && this.initializedAppId !== resolvedAppId) {
        throw new ConfigurationError(
          "Primus adapter cannot be re-initialized with a different zkTlsAppId.",
          {
            initializedAppId: this.initializedAppId,
            requestedAppId: resolvedAppId
          }
        );
      }

      return true;
    }

    const runtime = await this.getRuntime();
    const result = await runtime.init(
      resolvedAppId,
      this.config.appSecret,
      { env: "development" }
    );
    this.initialized = true;
    this.initializedAppId = resolvedAppId;
    return result;
  }

  async collectAttestationBundle(input: CollectPrimusAttestationInput): Promise<PrimusAttestationBundle> {
    if (!this.initialized) {
      await this.init(input.zktlsAppId);
    } else if (
      input.zktlsAppId !== undefined &&
      input.zktlsAppId.trim().length > 0 &&
      this.initializedAppId !== input.zktlsAppId.trim()
    ) {
      throw new ConfigurationError(
        "Primus adapter received a different zkTlsAppId after initialization.",
        {
          initializedAppId: this.initializedAppId,
          requestedAppId: input.zktlsAppId
        }
      );
    }

    const runtime = await this.getRuntime();
    const request = runtime.generateRequestParams(input.templateId, input.userAddress, input.timeoutMs);

    request.setAttMode({
      algorithmType: input.algorithmType ?? "proxytls",
      ...(input.resultType === undefined ? {} : { resultType: input.resultType })
    });

    if (input.additionParams) {
      request.setAdditionParams(JSON.stringify(input.additionParams));
    }

    if (input.attConditions && input.attConditions.length > 0) {
      request.setAttConditions(input.attConditions);
    }

    if (input.allJsonResponseFlag !== undefined) {
      if (input.allJsonResponseFlag !== "true" && input.allJsonResponseFlag !== "false") {
        throw new ConfigurationError('collectAttestationBundle allJsonResponseFlag must be "true" or "false".', {
          value: input.allJsonResponseFlag
        });
      }
      request.setAllJsonResponseFlag?.(input.allJsonResponseFlag);
    }

    const requestStr = request.toJsonString();
    const signedRequest = await this.signRequest(requestStr, runtime);
    await input.onBeforeStartAttestation?.();
    const attestation = await runtime.startAttestation(signedRequest);
    const verified = runtime.verifyAttestation(attestation);

    if (!verified) {
      throw new SdkError("Primus attestation verification failed.", "PROTOCOL_ERROR");
    }

    const requestId = this.resolveRequestId(request.requestid, signedRequest, attestation);
    const privateData = runtime.getPrivateData(requestId);

    return {
      requestId,
      zkTlsProof: {
        public_data: attestation,
        private_data: privateData
      },
      attestation,
      privateData
    };
  }

  private async getRuntime(): Promise<PrimusZkTlsRuntime> {
    if (!this.runtimePromise) {
      const factory = this.config.runtimeFactory ?? loadPrimusZkTlsRuntime;
      this.runtimePromise = Promise.resolve(factory());
    }

    return this.runtimePromise;
  }

  private async signRequest(requestStr: string, runtime: PrimusZkTlsRuntime): Promise<string> {
    const signer = this.resolveSigner(runtime);
    const appId = this.initializedAppId;
    if (!appId) {
      throw new ConfigurationError("Primus adapter must be initialized before signing.");
    }

    return signer.sign(requestStr, appId);
  }

  private resolveSigner(runtime: PrimusZkTlsRuntime): PrimusRequestSigner {
    if (this.config.signer) {
      return this.config.signer;
    }

    if (this.config.appSecret) {
      return {
        sign: async (requestStr: string, appId: string) => {
          void appId;
          return runtime.sign(requestStr);
        }
      };
    }

    throw new ConfigurationError(
      "Primus signing requires either appSecret or an injected signer."
    );
  }

  private resolveRequestId(
    requestId: string | undefined,
    signedRequest: string,
    attestation: { requestid?: string; request?: Record<string, unknown> }
  ): string {
    if (requestId) {
      return requestId;
    }

    const parsedSignedRequest = JSON.parse(signedRequest) as {
      attRequest?: { requestid?: string };
    };
    const signedRequestId = parsedSignedRequest.attRequest?.requestid;
    if (signedRequestId) {
      return signedRequestId;
    }

    const attestationRequestId =
      attestation.requestid ??
      (typeof attestation.request?.requestid === "string" ? attestation.request.requestid : undefined);
    if (attestationRequestId) {
      return attestationRequestId;
    }

    throw new SdkError("Unable to resolve Primus requestId from attestation flow.", "VALIDATION_ERROR");
  }

  private resolveAppId(appId?: string): string {
    const resolved = (appId ?? this.config.appId)?.trim();
    if (!resolved) {
      throw new ConfigurationError("Primus zkTlsAppId must be resolved before adapter init.");
    }

    return resolved;
  }
}

export function createPrimusZkTlsAdapter(config: PrimusZkTlsAdapterConfig): PrimusZkTlsAdapter {
  return new DefaultPrimusZkTlsAdapter(config);
}
