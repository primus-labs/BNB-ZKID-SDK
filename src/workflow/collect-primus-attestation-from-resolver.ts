import type { PrimusTemplateResolver } from "../primus/template-resolver.js";
import type { PrimusAttestationBundle, PrimusZkTlsAdapter } from "../primus/types.js";
import { collectPrimusAttestationForProveInput } from "./collect-primus-attestation.js";

export async function collectPrimusAttestationFromTemplateResolver(
  adapter: PrimusZkTlsAdapter,
  templateResolver: PrimusTemplateResolver,
  input: {
    appId: string;
    proveInput: Parameters<typeof collectPrimusAttestationForProveInput>[1]["proveInput"];
    additionParams?: Parameters<typeof collectPrimusAttestationForProveInput>[1]["additionParams"];
    onBeforeStartAttestation?: Parameters<
      typeof collectPrimusAttestationForProveInput
    >[1]["onBeforeStartAttestation"];
  }
): Promise<PrimusAttestationBundle> {
  const resolvedTemplate = await templateResolver.resolveTemplate({
    appId: input.appId,
    identityPropertyId: input.proveInput.identityPropertyId
  });

  const {
    templateId,
    zktlsAppId,
    attConditions,
    allJsonResponseFlag,
    additionParams: resolverAdditionParams
  } = resolvedTemplate;

  const resolvedPrimusTemplateOptions =
    attConditions !== undefined ||
    allJsonResponseFlag !== undefined ||
    resolverAdditionParams !== undefined
      ? {
          ...(attConditions !== undefined ? { attConditions } : {}),
          ...(allJsonResponseFlag !== undefined ? { allJsonResponseFlag } : {}),
          ...(resolverAdditionParams !== undefined ? { additionParams: resolverAdditionParams } : {})
        }
      : undefined;

  return collectPrimusAttestationForProveInput(adapter, {
    templateId,
    ...(zktlsAppId === undefined ? {} : { zktlsAppId }),
    proveInput: input.proveInput,
    ...(input.additionParams === undefined ? {} : { additionParams: input.additionParams }),
    ...(resolvedPrimusTemplateOptions === undefined
      ? {}
      : { resolvedPrimusTemplateOptions }),
    ...(input.onBeforeStartAttestation === undefined
      ? {}
      : { onBeforeStartAttestation: input.onBeforeStartAttestation })
  });
}
