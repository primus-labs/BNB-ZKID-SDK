import { getListdaoTemplateAttOptions } from "../config/listdao-primus-template-options.js";
import type { PrimusAttestationBundle, PrimusZkTlsAdapter } from "../primus/types.js";
import type { CollectPrimusBundleForProveInput } from "../primus/types.js";

export async function collectPrimusAttestationForProveInput(
  adapter: PrimusZkTlsAdapter,
  input: CollectPrimusBundleForProveInput
): Promise<PrimusAttestationBundle> {
  const { proveInput, templateId } = input;
  const listdao = getListdaoTemplateAttOptions(templateId);
  const attConditions = input.attConditions?.length ? input.attConditions : listdao?.attConditions;
  const allJsonResponseFlag = input.allJsonResponseFlag ?? listdao?.allJsonResponseFlag;

  return adapter.collectAttestationBundle({
    templateId,
    userAddress: proveInput.userAddress,
    ...(input.zktlsAppId === undefined ? {} : { zktlsAppId: input.zktlsAppId }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.algorithmType === undefined ? {} : { algorithmType: input.algorithmType }),
    ...(input.resultType === undefined ? {} : { resultType: input.resultType }),
    ...(attConditions === undefined || attConditions.length === 0 ? {} : { attConditions }),
    ...(allJsonResponseFlag === undefined ? {} : { allJsonResponseFlag }),
    additionParams: {
      clientRequestId: proveInput.clientRequestId,
      identityPropertyId: proveInput.identityPropertyId,
      ...(proveInput.provingParams ? { provingParams: proveInput.provingParams } : {}),
      ...(listdao?.additionParams ?? {}),
      ...(input.additionParams ?? {})
    }
  });
}
