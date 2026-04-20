import type {
  CollectPrimusBundleForProveInput,
  PrimusAttestationBundle,
  PrimusZkTlsAdapter
} from "../primus/types.js";
import type { ProvingParams } from "../types/public.js";

/** Reads `provingParams.jumpToUrl` for top-level Primus `additionParams.jumpToUrl` only (`businessParams` is not sent in `additionParams`). */
function jumpToUrlFromProvingParams(provingParams: ProvingParams | undefined): string | undefined {
  if (provingParams === undefined || typeof provingParams !== "object" || provingParams === null) {
    return undefined;
  }
  const record = provingParams as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "jumpToUrl")) {
    return undefined;
  }
  const jumpRaw = record.jumpToUrl;
  return typeof jumpRaw === "string" && jumpRaw.trim() !== "" ? jumpRaw.trim() : undefined;
}

export async function collectPrimusAttestationForProveInput(
  adapter: PrimusZkTlsAdapter,
  input: CollectPrimusBundleForProveInput
): Promise<PrimusAttestationBundle> {
  const { proveInput, templateId } = input;
  const resolved = input.resolvedPrimusTemplateOptions;
  const attConditions = input.attConditions?.length ? input.attConditions : resolved?.attConditions;
  const allJsonResponseFlag = input.allJsonResponseFlag ?? resolved?.allJsonResponseFlag;
  const jumpToUrl = jumpToUrlFromProvingParams(proveInput.provingParams);

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
      ...(resolved?.additionParams ?? {}),
      ...(input.additionParams ?? {}),
      ...(jumpToUrl !== undefined ? { jumpToUrl } : {})
    }
  });
}
