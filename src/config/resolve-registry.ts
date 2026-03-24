import type { PrimusProvingDataRegistry } from "../primus/request-resolver.js";
import type { BnbZkIdPrimusRegistryRuleConfig } from "./types.js";

export function resolvePrimusRegistry(
  registryConfig: Record<string, BnbZkIdPrimusRegistryRuleConfig>
): PrimusProvingDataRegistry {
  return Object.fromEntries(
    Object.entries(registryConfig).map(([identityPropertyId, rule]) => [
      identityPropertyId,
      {
        templateId: rule.templateId,
        ...(rule.timeoutMs === undefined ? {} : { timeoutMs: rule.timeoutMs }),
        ...(rule.algorithmType === undefined ? {} : { algorithmType: rule.algorithmType }),
        ...(rule.resultType === undefined ? {} : { resultType: rule.resultType }),
        ...(rule.fieldRules === undefined
          ? {}
          : {
              fieldRules: Object.fromEntries(
                Object.entries(rule.fieldRules).map(([field, fieldRule]) => [
                  field,
                  {
                    op: fieldRule.op,
                    encodeValue: (threshold: number) =>
                      String(threshold + (fieldRule.valueOffset ?? 0))
                  }
                ])
              )
            })
      }
    ])
  );
}
