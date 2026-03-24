import { ConfigurationError } from "../errors/sdk-error.js";
import type { ProveInput, ProvingParams } from "../types/public.js";
import type {
  CollectPrimusAttestationInput,
  PrimusAdditionParams,
  PrimusAlgorithmType,
  PrimusAttConditions
} from "./types.js";

export interface PrimusThresholdFieldRule {
  op: string;
  encodeValue?: (threshold: number) => string;
}

export interface PrimusProvingDataResolverContext {
  proveInput: Pick<ProveInput, "clientRequestId" | "provingDataId" | "provingParams" | "userAddress">;
}

export interface PrimusResolvedRequestConfig {
  templateId: string;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  attConditions?: PrimusAttConditions;
  additionParams?: PrimusAdditionParams;
}

export interface PrimusProvingDataRule {
  templateId: string;
  timeoutMs?: number;
  algorithmType?: PrimusAlgorithmType;
  resultType?: string;
  fieldRules?: Record<string, PrimusThresholdFieldRule>;
  resolveAttConditions?: (context: PrimusProvingDataResolverContext) => PrimusAttConditions | undefined;
  resolveAdditionParams?: (context: PrimusProvingDataResolverContext) => PrimusAdditionParams | undefined;
}

export type PrimusProvingDataRegistry = Record<string, PrimusProvingDataRule>;

export function createTieredThresholdAttConditions(
  provingParams: ProvingParams | undefined,
  fieldRules: Record<string, PrimusThresholdFieldRule>
): PrimusAttConditions | undefined {
  if (!provingParams) {
    return undefined;
  }

  const entries = Object.entries(fieldRules).filter(([field]) => {
    const values = provingParams[field];
    return Array.isArray(values) && values.length > 0;
  });

  if (entries.length === 0) {
    return undefined;
  }

  const maxTierCount = entries.reduce((max, [field]) => {
    return Math.max(max, provingParams[field]?.length ?? 0);
  }, 0);

  const attConditions: PrimusAttConditions = [];
  for (let tierIndex = 0; tierIndex < maxTierCount; tierIndex += 1) {
    const group = entries.flatMap(([field, rule]) => {
      const threshold = provingParams[field]?.[tierIndex];
      if (threshold === undefined) {
        return [];
      }

      return [
        {
          field,
          op: rule.op,
          value: rule.encodeValue ? rule.encodeValue(threshold) : String(threshold)
        }
      ];
    });

    if (group.length > 0) {
      attConditions.push(group);
    }
  }

  return attConditions.length > 0 ? attConditions : undefined;
}

export function resolvePrimusCollectInputForProve(
  registry: PrimusProvingDataRegistry,
  context: PrimusProvingDataResolverContext
): CollectPrimusAttestationInput {
  const rule = registry[context.proveInput.provingDataId];
  if (!rule) {
    throw new ConfigurationError("No Primus proving-data mapping found.", {
      provingDataId: context.proveInput.provingDataId
    });
  }

  const attConditions =
    rule.resolveAttConditions?.(context) ??
    createTieredThresholdAttConditions(context.proveInput.provingParams, rule.fieldRules ?? {});

  const additionParams = {
    clientRequestId: context.proveInput.clientRequestId,
    provingDataId: context.proveInput.provingDataId,
    ...(context.proveInput.provingParams ? { provingParams: context.proveInput.provingParams } : {}),
    ...(rule.resolveAdditionParams?.(context) ?? {})
  };

  return {
    templateId: rule.templateId,
    userAddress: context.proveInput.userAddress,
    ...(rule.timeoutMs === undefined ? {} : { timeoutMs: rule.timeoutMs }),
    ...(rule.algorithmType === undefined ? {} : { algorithmType: rule.algorithmType }),
    ...(rule.resultType === undefined ? {} : { resultType: rule.resultType }),
    ...(attConditions === undefined ? {} : { attConditions }),
    additionParams
  };
}
