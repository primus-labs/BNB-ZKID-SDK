import { ConfigurationError, SdkError } from "../errors/sdk-error.js";

export interface ResolvePrimusTemplateInput {
  appId: string;
  identityPropertyId: string;
}

export interface PrimusTemplateResolver {
  resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string>;
}

export interface PrimusServerTemplateResolverConfig {
  baseUrl: string;
  resolveTemplatePath: string;
  apiKey?: string;
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

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    const templateId = this.templateIds[input.identityPropertyId];
    if (!templateId) {
      throw new ConfigurationError("No Primus templateId mapping found.", {
        identityPropertyId: input.identityPropertyId
      });
    }

    return templateId;
  }
}

class HttpPrimusTemplateResolver implements PrimusTemplateResolver {
  constructor(private readonly config: PrimusServerTemplateResolverConfig) {}

  async resolveTemplateId(input: ResolvePrimusTemplateInput): Promise<string> {
    const response = await fetch(new URL(this.config.resolveTemplatePath, this.config.baseUrl), {
      method: "GET",
      headers: {
        ...(this.config.apiKey === undefined ? {} : { "x-api-key": this.config.apiKey })
      }
    });

    if (!response.ok) {
      throw new SdkError("Unable to resolve Primus templateId.", "TRANSPORT_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId,
        status: response.status
      });
    }

    const payload = (await response.json()) as ResolvePrimusTemplateResponse;
    if (payload.rc !== 0 || typeof payload.result !== "object" || payload.result === null) {
      throw new SdkError("Primus template resolver returned an invalid payload.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId
      });
    }

    const responseKeys = this.resolveResponseKeys(input.identityPropertyId);
    const matchedKey = responseKeys.find((key) => {
      const value = payload.result?.[key];
      return typeof value === "string" && value.trim().length > 0;
    });
    const templateId = matchedKey ? payload.result[matchedKey] : undefined;
    if (typeof templateId !== "string" || templateId.trim().length === 0) {
      throw new SdkError("Primus template resolver returned an invalid templateId.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId,
        responseKeys
      });
    }

    return templateId.trim();
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
