import { ConfigurationError, SdkError } from "../errors/sdk-error.js";

export interface ResolvePrimusTemplateInput {
  appId: string;
  identityPropertyId: string;
}

export interface ResolvePrimusAppInput {
  appId: string;
}

export interface ResolvePrimusAppResult {
  zktlsAppId?: string;
}

export interface ResolvePrimusTemplateResult {
  templateId: string;
  zktlsAppId?: string;
}

export interface PrimusTemplateResolver {
  resolveAppConfig(input: ResolvePrimusAppInput): Promise<ResolvePrimusAppResult>;
  resolveTemplate(input: ResolvePrimusTemplateInput): Promise<ResolvePrimusTemplateResult>;
  resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string>;
}

export interface PrimusServerTemplateResolverConfig {
  baseUrl: string;
  resolveTemplatePath: string;
  apiKey?: string;
  appResponseKeyMap?: Record<string, string>;
  responseKeyMap?: Record<string, string>;
}

interface ResolvePrimusTemplateResponse {
  rc?: unknown;
  mc?: unknown;
  msg?: unknown;
  result?: Record<string, unknown>;
}

class StaticPrimusTemplateResolver implements PrimusTemplateResolver {
  constructor(private readonly templateIds: Record<string, string>) {}

  async resolveAppConfig(input: ResolvePrimusAppInput): Promise<ResolvePrimusAppResult> {
    void input;

    return {};
  }

  async resolveTemplate(input: ResolvePrimusTemplateInput): Promise<ResolvePrimusTemplateResult> {
    const templateId = this.templateIds[input.identityPropertyId];
    if (!templateId) {
      throw new ConfigurationError("No Primus templateId mapping found.", {
        identityPropertyId: input.identityPropertyId
      });
    }

    return {
      templateId
    };
  }

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    return (await this.resolveTemplate(input)).templateId;
  }
}

class HttpPrimusTemplateResolver implements PrimusTemplateResolver {
  private payloadPromise: Promise<ResolvePrimusTemplateResponse> | undefined;

  constructor(private readonly config: PrimusServerTemplateResolverConfig) {}

  async resolveAppConfig(input: ResolvePrimusAppInput): Promise<ResolvePrimusAppResult> {
    const payload = await this.loadPayload(input);
    if (payload.rc !== 0 || typeof payload.result !== "object" || payload.result === null) {
      throw new SdkError("Primus template resolver returned an invalid payload.", "VALIDATION_ERROR", {
        appId: input.appId,
        stage: "resolveAppConfig"
      });
    }

    const appPayload = this.resolveAppPayload(input, payload.result);
    return {
      zktlsAppId: this.resolveZkTlsAppId(input, appPayload)
    };
  }

  async resolveTemplate(input: ResolvePrimusTemplateInput): Promise<ResolvePrimusTemplateResult> {
    const appConfig = await this.resolveAppConfig({
      appId: input.appId
    });
    const payload = await this.loadPayload(input);
    if (payload.rc !== 0 || typeof payload.result !== "object" || payload.result === null) {
      throw new SdkError("Primus template resolver returned an invalid payload.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId
      });
    }

    const appPayload = this.resolveAppPayload(input, payload.result);
    const responseKeys = this.resolveResponseKeys(input.identityPropertyId);
    const matchedKey = responseKeys.find((key) => {
      const value = appPayload[key];
      return typeof value === "string" && value.trim().length > 0;
    });
    const templateId = matchedKey ? appPayload[matchedKey] : undefined;
    if (typeof templateId !== "string" || templateId.trim().length === 0) {
      throw new SdkError("Primus template resolver returned an invalid templateId.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId,
        responseKeys
      });
    }

    return {
      templateId: templateId.trim(),
      ...(appConfig.zktlsAppId === undefined ? {} : { zktlsAppId: appConfig.zktlsAppId })
    };
  }

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    return (await this.resolveTemplate(input)).templateId;
  }

  private async loadPayload(
    input: ResolvePrimusAppInput | ResolvePrimusTemplateInput
  ): Promise<ResolvePrimusTemplateResponse> {
    if (!this.payloadPromise) {
      this.payloadPromise = fetch(
        new URL(this.config.resolveTemplatePath, this.config.baseUrl),
        {
          method: "GET",
          headers: {
            ...(this.config.apiKey === undefined ? {} : { "x-api-key": this.config.apiKey })
          }
        }
      ).then(async (response) => {
        if (!response.ok) {
          throw new SdkError("Unable to resolve Primus templateId.", "TRANSPORT_ERROR", {
            appId: input.appId,
            ...(this.hasIdentityPropertyId(input)
              ? { identityPropertyId: input.identityPropertyId }
              : {}),
            status: response.status
          });
        }

        return (await response.json()) as ResolvePrimusTemplateResponse;
      });
    }

    return this.payloadPromise;
  }

  private resolveAppPayload(
    input: ResolvePrimusAppInput | ResolvePrimusTemplateInput,
    payloadResult: Record<string, unknown>
  ): Record<string, unknown> {
    const candidateKeys = [
      this.config.appResponseKeyMap?.[input.appId],
      input.appId
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    for (const key of candidateKeys) {
      const value = payloadResult[key];
      if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
      }
    }

    const appEntries = Object.entries(payloadResult).filter(
      ([, value]) => typeof value === "object" && value !== null
    );
    if (appEntries.length === 1) {
      const [singleAppEntry] = appEntries;
      if (singleAppEntry) {
        return singleAppEntry[1] as Record<string, unknown>;
      }
    }

    throw new SdkError("Primus template resolver could not resolve the app payload.", "VALIDATION_ERROR", {
      appId: input.appId,
      ...(this.hasIdentityPropertyId(input)
        ? { identityPropertyId: input.identityPropertyId }
        : {}),
      availableAppKeys: Object.keys(payloadResult)
    });
  }

  private resolveZkTlsAppId(
    input: ResolvePrimusAppInput | ResolvePrimusTemplateInput,
    appPayload: Record<string, unknown>
  ): string {
    const zktlsAppId = appPayload.zkTlsAppId;
    if (typeof zktlsAppId !== "string" || zktlsAppId.trim().length === 0) {
      throw new SdkError("Primus template resolver returned an invalid zkTlsAppId.", "VALIDATION_ERROR", {
        appId: input.appId,
        ...(this.hasIdentityPropertyId(input)
          ? { identityPropertyId: input.identityPropertyId }
          : {})
      });
    }

    return zktlsAppId.trim();
  }

  private hasIdentityPropertyId(
    input: ResolvePrimusAppInput | ResolvePrimusTemplateInput
  ): input is ResolvePrimusTemplateInput {
    return "identityPropertyId" in input;
  }

  private resolveResponseKeys(identityPropertyId: string): string[] {
    const mappedKey = this.config.responseKeyMap?.[identityPropertyId];
    if (mappedKey) {
      return [mappedKey];
    }

    if (identityPropertyId.endsWith("IdentityPropertyId")) {
      return [identityPropertyId];
    }

    const providerPrefix = identityPropertyId.split("_")[0]?.trim();
    if (!providerPrefix) {
      throw new ConfigurationError("Unable to derive Primus template response key.", {
        identityPropertyId
      });
    }

    return [identityPropertyId, `${providerPrefix}IdentityPropertyId`];
  }
}

export function createStaticPrimusTemplateResolver(
  templateIds: Record<string, string>
): PrimusTemplateResolver {
  return new StaticPrimusTemplateResolver(templateIds);
}

export function createHttpPrimusTemplateResolver(
  config: PrimusServerTemplateResolverConfig
): PrimusTemplateResolver {
  return new HttpPrimusTemplateResolver(config);
}
