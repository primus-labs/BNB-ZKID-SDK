import { ConfigurationError, SdkError } from "../errors/sdk-error.js";
import { joinBaseUrlAndPath } from "../util/join-base-url.js";
import type {
  PrimusAttCondition,
  PrimusAttConditions,
  PrimusAdditionParams,
  ResolvePrimusTemplateResult
} from "./types.js";

export type { ResolvePrimusTemplateResult, ResolvedPrimusTemplateOptions } from "./types.js";

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

/** `result.{appKey}`: PADO may use a chain app id (0x…) or legacy name (e.g. brevisListaDAO). */
function isTemplatesAppBucket(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o.zkTlsAppId === "string" && o.zkTlsAppId.trim().length > 0;
}

function isTemplateEntryValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  const id = o.zktlsTemplateId ?? o.templateId;
  return typeof id === "string" && id.trim().length > 0;
}

function keysEqualLooseHex(a: string, b: string): boolean {
  const na = a.trim();
  const nb = b.trim();
  if (na.startsWith("0x") && nb.startsWith("0x")) {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

function legacyIdentityResponseKeyCandidates(identityPropertyId: string): string[] {
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

function findTemplateRawInAppPayload(
  appPayload: Record<string, unknown>,
  identityPropertyId: string,
  config: PrimusServerTemplateResolverConfig
): { raw: unknown; responseKeys: string[] } | undefined {
  const mappedKey = config.responseKeyMap?.[identityPropertyId];
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => {
    const t = k.trim();
    if (!seen.has(t)) {
      seen.add(t);
      candidates.push(t);
    }
  };

  if (mappedKey) {
    add(mappedKey);
  }
  const trimmedId = identityPropertyId.trim();
  add(trimmedId);

  const isHexLike = /^0x[0-9a-fA-F]+$/.test(trimmedId);
  if (isHexLike) {
    for (const k of Object.keys(appPayload)) {
      if (k === "zkTlsAppId") {
        continue;
      }
      if (keysEqualLooseHex(k, trimmedId)) {
        add(k);
      }
    }
  } else {
    for (const k of legacyIdentityResponseKeyCandidates(trimmedId)) {
      add(k);
    }
  }

  for (const key of candidates) {
    const value = appPayload[key];
    if (isTemplateEntryValue(value)) {
      return { raw: value, responseKeys: candidates };
    }
  }

  return undefined;
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
    const payload = await this.loadPayload(input);
    if (payload.rc !== 0 || typeof payload.result !== "object" || payload.result === null) {
      throw new SdkError("Primus template resolver returned an invalid payload.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId
      });
    }

    const appPayload = this.resolveAppPayload(input, payload.result, input.identityPropertyId);
    const found = findTemplateRawInAppPayload(appPayload, input.identityPropertyId, this.config);
    if (found === undefined) {
      throw new SdkError("Primus template resolver returned an invalid templateId.", "VALIDATION_ERROR", {
        appId: input.appId,
        identityPropertyId: input.identityPropertyId
      });
    }

    const extracted = extractIdentityTemplateEntry(found.raw, {
      appId: input.appId,
      identityPropertyId: input.identityPropertyId,
      responseKeys: found.responseKeys
    });

    return {
      ...extracted,
      zktlsAppId: this.resolveZkTlsAppId(input, appPayload)
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
        joinBaseUrlAndPath(this.config.baseUrl, this.config.resolveTemplatePath),
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
    payloadResult: Record<string, unknown>,
    identityPropertyId?: string
  ): Record<string, unknown> {
    const bucketForKey = (key: string): Record<string, unknown> | undefined => {
      const direct = payloadResult[key];
      if (isTemplatesAppBucket(direct)) {
        return direct;
      }
      for (const [k, v] of Object.entries(payloadResult)) {
        if (keysEqualLooseHex(k, key) && isTemplatesAppBucket(v)) {
          return v;
        }
      }
      return undefined;
    };

    const mapTarget = this.config.appResponseKeyMap?.[input.appId];
    if (mapTarget !== undefined && mapTarget.trim() !== "") {
      const hit = bucketForKey(mapTarget.trim());
      if (hit) {
        return hit;
      }
    }

    const byAppId = bucketForKey(input.appId);
    if (byAppId) {
      return byAppId;
    }

    const buckets = Object.entries(payloadResult).filter(
      ([name, value]) =>
        name !== "error" && typeof value === "object" && value !== null && isTemplatesAppBucket(value)
    );

    if (buckets.length === 1) {
      const pair = buckets[0];
      const bucketValue = pair?.[1];
      if (isTemplatesAppBucket(bucketValue)) {
        return bucketValue;
      }
    }

    if (buckets.length > 1 && identityPropertyId) {
      for (const [, bucket] of buckets) {
        if (
          isTemplatesAppBucket(bucket) &&
          findTemplateRawInAppPayload(bucket, identityPropertyId, this.config) !== undefined
        ) {
          return bucket;
        }
      }
    }

    const objectEntries = Object.entries(payloadResult).filter(
      ([, value]) => typeof value === "object" && value !== null
    );
    if (objectEntries.length === 1) {
      const single = objectEntries[0];
      const singleValue = single?.[1];
      if (isTemplatesAppBucket(singleValue)) {
        return singleValue;
      }
    }

    throw new SdkError("Primus template resolver could not resolve the app payload.", "VALIDATION_ERROR", {
      appId: input.appId,
      ...(identityPropertyId !== undefined ? { identityPropertyId } : {}),
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
}

function extractIdentityTemplateEntry(
  raw: unknown,
  context: { appId: string; identityPropertyId: string; responseKeys: string[] }
): ResolvePrimusTemplateResult {
  if (typeof raw === "string") {
    const templateId = raw.trim();
    if (!templateId) {
      throw new SdkError("Primus template resolver returned an invalid templateId.", "VALIDATION_ERROR", {
        appId: context.appId,
        identityPropertyId: context.identityPropertyId,
        responseKeys: context.responseKeys
      });
    }
    return { templateId };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SdkError("Primus template resolver returned an invalid template entry.", "VALIDATION_ERROR", {
      appId: context.appId,
      identityPropertyId: context.identityPropertyId,
      responseKeys: context.responseKeys
    });
  }

  const o = raw as Record<string, unknown>;
  const idRaw = o.zktlsTemplateId ?? o.templateId;
  if (typeof idRaw !== "string" || idRaw.trim().length === 0) {
    throw new SdkError("Primus template resolver returned an invalid templateId.", "VALIDATION_ERROR", {
      appId: context.appId,
      identityPropertyId: context.identityPropertyId,
      responseKeys: context.responseKeys
    });
  }

  const result: ResolvePrimusTemplateResult = { templateId: idRaw.trim() };

  if ("attConditions" in o && o.attConditions !== undefined) {
    result.attConditions = normalizeAttConditions(o.attConditions, context);
  }
  if (o.allJsonResponseFlag === "true" || o.allJsonResponseFlag === "false") {
    result.allJsonResponseFlag = o.allJsonResponseFlag;
  }
  if (typeof o.additionParams === "object" && o.additionParams !== null && !Array.isArray(o.additionParams)) {
    result.additionParams = o.additionParams as PrimusAdditionParams;
  }

  return result;
}

function normalizeAttConditions(
  raw: unknown,
  context: { appId: string; identityPropertyId: string }
): PrimusAttConditions {
  if (!Array.isArray(raw)) {
    throw new SdkError("Primus template resolver returned invalid attConditions.", "VALIDATION_ERROR", {
      appId: context.appId,
      identityPropertyId: context.identityPropertyId
    });
  }

  return raw.map((group, groupIndex) => {
    if (!Array.isArray(group)) {
      throw new SdkError("Primus template resolver returned invalid attConditions group.", "VALIDATION_ERROR", {
        appId: context.appId,
        identityPropertyId: context.identityPropertyId,
        groupIndex
      });
    }

    return group.map((cond, conditionIndex) => {
      if (typeof cond !== "object" || cond === null) {
        throw new SdkError("Primus template resolver returned invalid attCondition.", "VALIDATION_ERROR", {
          appId: context.appId,
          identityPropertyId: context.identityPropertyId,
          groupIndex,
          conditionIndex
        });
      }

      const c = cond as Record<string, unknown>;
      if (typeof c.field !== "string" || typeof c.op !== "string") {
        throw new SdkError("Primus template resolver returned invalid attCondition.", "VALIDATION_ERROR", {
          appId: context.appId,
          identityPropertyId: context.identityPropertyId,
          groupIndex,
          conditionIndex
        });
      }

      const out: PrimusAttCondition = { field: c.field, op: c.op };
      if (typeof c.value === "string") {
        out.value = c.value;
      }

      return out;
    });
  });
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
