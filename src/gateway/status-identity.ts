import type { GatewayConfig, GatewayIdentityPropertyConfig, GatewayStatusIdentityProperty } from "./types.js";

export function findIdentityPropertyConfig(
  gatewayConfig: GatewayConfig,
  identityPropertyId: string
): GatewayIdentityPropertyConfig | undefined {
  for (const provider of gatewayConfig.providers) {
    for (const ip of provider.identityProperties) {
      if (ip.identityPropertyId === identityPropertyId) {
        return ip;
      }
    }
  }
  return undefined;
}

export function resolveProviderIdForIdentityPropertyId(
  gatewayConfig: GatewayConfig,
  identityPropertyId: string
): string | undefined {
  for (const provider of gatewayConfig.providers) {
    if (provider.identityProperties.some((ip) => ip.identityPropertyId === identityPropertyId)) {
      return provider.providerId;
    }
  }
  return undefined;
}

/** Framework `GET /v1/proof-requests` `identityProperty` shape from normalized config. */
export function gatewayConfigToStatusIdentityProperty(
  ip: GatewayIdentityPropertyConfig
): GatewayStatusIdentityProperty {
  return {
    id: ip.identityPropertyId,
    ...(ip.description === undefined ? {} : { description: ip.description }),
    ...(ip.businessParams === undefined ? {} : { businessParams: ip.businessParams })
  };
}
