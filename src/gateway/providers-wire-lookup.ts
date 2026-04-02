import type {
  BnbZkIdGatewayConfigProviderWire
} from "../types/gateway-config-wire.js";

/** Locate `properties[].businessParams` for a Brevis-style property `id` / on-chain hex id. */
export function findBusinessParamsForIdentityPropertyIdInProvidersWire(
  providers: BnbZkIdGatewayConfigProviderWire[],
  identityPropertyId: string
): Record<string, unknown> | undefined {
  const needle = identityPropertyId.trim();
  for (const p of providers) {
    for (const prop of p.properties) {
      if (prop.id.trim() === needle) {
        return prop.businessParams;
      }
    }
  }
  return undefined;
}

/** True if `identityPropertyId` matches some `providers[].properties[].id` (after trim). */
export function isIdentityPropertyIdInProvidersWire(
  providers: BnbZkIdGatewayConfigProviderWire[],
  identityPropertyId: string
): boolean {
  const needle = identityPropertyId.trim();
  if (needle.length === 0) {
    return false;
  }
  return providers.some((p) => p.properties.some((prop) => prop.id.trim() === needle));
}
