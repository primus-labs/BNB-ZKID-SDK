import type { PrimusAttestationBundle, PrimusZkTlsAdapter } from "../primus/types.js";
import type { CollectPrimusBundleForProveInput } from "../primus/types.js";

export async function collectPrimusAttestationForProveInput(
  adapter: PrimusZkTlsAdapter,
  input: CollectPrimusBundleForProveInput
): Promise<PrimusAttestationBundle> {
  const { proveInput } = input;

  return adapter.collectAttestationBundle({
    templateId: input.templateId,
    userAddress: proveInput.userAddress,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.algorithmType === undefined ? {} : { algorithmType: input.algorithmType }),
    ...(input.resultType === undefined ? {} : { resultType: input.resultType }),
    ...(input.attConditions === undefined ? {} : { attConditions: input.attConditions }),
    additionParams: {
      clientRequestId: proveInput.clientRequestId,
      identityPropertyId: proveInput.identityPropertyId,
      ...(proveInput.provingParams ? { provingParams: proveInput.provingParams } : {}),
      ...(input.additionParams ?? {})
    }
  });
}
