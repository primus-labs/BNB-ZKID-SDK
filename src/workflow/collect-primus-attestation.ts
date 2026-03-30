import type {
  CollectPrimusBundleForProveInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../primus/types.js";

export async function collectPrimusAttestationForProveInput(
  adapter: PrimusZkTlsAdapter,
  input: CollectPrimusBundleForProveInput
): Promise<PrimusAttestationBundle> {
  const { proveInput, templateId } = input;
  const resolved = input.resolvedPrimusTemplateOptions;
  const attConditions = input.attConditions?.length ? input.attConditions : resolved?.attConditions;
  const allJsonResponseFlag = input.allJsonResponseFlag ?? resolved?.allJsonResponseFlag;

  return adapter.collectAttestationBundle({
    templateId,
    userAddress: proveInput.userAddress,
    ...(input.zktlsAppId === undefined ? {} : { zktlsAppId: input.zktlsAppId }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.algorithmType === undefined ? {} : { algorithmType: input.algorithmType }),
    ...(input.resultType === undefined ? {} : { resultType: input.resultType }),
    ...(attConditions === undefined || attConditions.length === 0 ? {} : { attConditions }),
    ...(allJsonResponseFlag === undefined ? {} : { allJsonResponseFlag }),
    ...(input.onBeforeStartAttestation === undefined
      ? {}
      : { onBeforeStartAttestation: input.onBeforeStartAttestation }),
    additionParams: {
      clientRequestId: proveInput.clientRequestId,
      identityPropertyId: proveInput.identityPropertyId,
      ...(proveInput.provingParams ? { provingParams: proveInput.provingParams } : {}),
      ...(resolved?.additionParams ?? {}),
      ...(input.additionParams ?? {})
    }
  });
}
