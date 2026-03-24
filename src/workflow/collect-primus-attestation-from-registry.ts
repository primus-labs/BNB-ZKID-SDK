import type { PrimusProvingDataRegistry } from "../primus/request-resolver.js";
import { resolvePrimusCollectInputForProve } from "../primus/request-resolver.js";
import type { PrimusAttestationBundle, PrimusZkTlsAdapter } from "../primus/types.js";
import type { CollectPrimusBundleForProveInput } from "../primus/types.js";

export async function collectPrimusAttestationFromRegistry(
  adapter: PrimusZkTlsAdapter,
  registry: PrimusProvingDataRegistry,
  input: Omit<CollectPrimusBundleForProveInput, "templateId">
): Promise<PrimusAttestationBundle> {
  const collectInput = resolvePrimusCollectInputForProve(registry, {
    proveInput: input.proveInput
  });

  return adapter.collectAttestationBundle({
    ...collectInput,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.algorithmType === undefined ? {} : { algorithmType: input.algorithmType }),
    ...(input.resultType === undefined ? {} : { resultType: input.resultType }),
    ...(input.attConditions === undefined ? {} : { attConditions: input.attConditions }),
    additionParams: {
      ...(collectInput.additionParams ?? {}),
      ...(input.additionParams ?? {})
    }
  });
}
