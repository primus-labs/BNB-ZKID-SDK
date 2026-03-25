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
  }
): Promise<PrimusAttestationBundle> {
  const templateId = await templateResolver.resolveTemplateId({
    appId: input.appId,
    identityPropertyId: input.proveInput.identityPropertyId
  });

  return collectPrimusAttestationForProveInput(adapter, {
    templateId,
    proveInput: input.proveInput,
    ...(input.additionParams === undefined ? {} : { additionParams: input.additionParams })
  });
}
