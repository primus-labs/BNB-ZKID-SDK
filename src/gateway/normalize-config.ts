import { SdkError } from "../errors/sdk-error.js";
import type {
  BnbZkIdGatewayConfigPropertyWire,
  BnbZkIdGatewayConfigProviderWire
} from "../types/gateway-config-wire.js";
import type {
  GatewayConfig,
  GatewayIdentityPropertyConfig,
  GatewayProviderConfig
} from "./types.js";

/** Wire shape from Brevis-style `GET /v1/config` (on-chain provider / property ids). */
interface BrevisConfigPropertyWire {
  id: string;
  description?: string;
  businessParams?: unknown;
}

interface BrevisConfigProviderWire {
  id: string;
  description?: string;
  properties: BrevisConfigPropertyWire[];
}

interface BrevisConfigWire {
  providers: BrevisConfigProviderWire[];
  error?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyGatewayConfigShape(raw: unknown): raw is GatewayConfig {
  if (!isRecord(raw) || !Array.isArray(raw.appIds) || !Array.isArray(raw.providers)) {
    return false;
  }

  return raw.providers.every((p) => {
    if (!isRecord(p) || typeof p.providerId !== "string" || !Array.isArray(p.identityProperties)) {
      return false;
    }
    return p.identityProperties.every(
      (ip) => isRecord(ip) && typeof ip.identityPropertyId === "string"
    );
  });
}

function isBrevisGatewayConfigShape(raw: unknown): raw is BrevisConfigWire {
  if (!isRecord(raw) || !Array.isArray(raw.providers)) {
    return false;
  }

  if (raw.providers.length === 0) {
    return true;
  }

  const first = raw.providers[0];
  if (!isRecord(first) || typeof first.id !== "string" || !Array.isArray(first.properties)) {
    return false;
  }

  return first.properties.every((prop) => isRecord(prop) && typeof prop.id === "string");
}

function throwIfConfigTopLevelError(obj: Record<string, unknown>): void {
  if (obj.error == null) {
    return;
  }

  if (!isRecord(obj.error)) {
    throw new SdkError("Gateway /v1/config returned an error payload.", "VALIDATION_ERROR", {
      error: obj.error
    });
  }

  const err = obj.error;
  const code = typeof err.code === "string" ? err.code : "GATEWAY_CONFIG_ERROR";
  const message =
    typeof err.message === "string" ? err.message : "Gateway /v1/config returned an error.";

  throw new SdkError(message, "VALIDATION_ERROR", { code, details: err });
}

function normalizeBrevisConfig(wire: BrevisConfigWire): GatewayConfig {
  const providers: GatewayProviderConfig[] = wire.providers.map((prov) => ({
    providerId: prov.id.trim(),
    identityProperties: prov.properties.map(
      (prop): GatewayIdentityPropertyConfig => {
        const identityPropertyId = prop.id.trim();

        const businessParams =
          prop.businessParams !== undefined &&
          typeof prop.businessParams === "object" &&
          prop.businessParams !== null &&
          !Array.isArray(prop.businessParams)
            ? (prop.businessParams as Record<string, unknown>)
            : undefined;

        const description =
          typeof prop.description === "string" && prop.description.trim() !== ""
            ? prop.description.trim()
            : undefined;

        return {
          identityPropertyId,
          ...(description === undefined ? {} : { description }),
          ...(businessParams === undefined ? {} : { businessParams })
        };
      }
    )
  }));

  return {
    appIds: [],
    providers
  };
}

/**
 * Normalizes remote `GET /v1/config` JSON into {@link GatewayConfig}.
 * Supports legacy fixture shape (`appIds` + `providerId` / `identityProperties`) and
 * Brevis wire shape (`providers[].id` + `properties[].id`).
 */
export function normalizeGatewayConfigPayload(raw: unknown): GatewayConfig {
  if (!isRecord(raw)) {
    throw new SdkError("Gateway /v1/config returned a non-object payload.", "VALIDATION_ERROR");
  }

  throwIfConfigTopLevelError(raw);

  if (isLegacyGatewayConfigShape(raw)) {
    return raw;
  }

  if (isBrevisGatewayConfigShape(raw)) {
    return normalizeBrevisConfig(raw);
  }

  throw new SdkError("Unrecognized Gateway /v1/config payload shape.", "VALIDATION_ERROR", {
    keys: Object.keys(raw)
  });
}

function clonePlainObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (
    value !== undefined &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return { ...(value as Record<string, unknown>) };
  }
  return undefined;
}

function brevisWireToPublicProviders(wire: BrevisConfigWire): BnbZkIdGatewayConfigProviderWire[] {
  return wire.providers.map(
    (prov): BnbZkIdGatewayConfigProviderWire => ({
      id: prov.id,
      ...(typeof prov.description === "string" && prov.description.trim() !== ""
        ? { description: prov.description.trim() }
        : {}),
      properties: prov.properties.map(
        (prop): BnbZkIdGatewayConfigPropertyWire => {
          const businessParams = clonePlainObjectRecord(prop.businessParams);
          return {
            id: prop.id,
            ...(typeof prop.description === "string" && prop.description.trim() !== ""
              ? { description: prop.description.trim() }
              : {}),
            ...(businessParams !== undefined ? { businessParams } : {})
          };
        }
      )
    })
  );
}

/**
 * Builds the public `providers` slice mirrored from `GET /v1/config` (Brevis wire) or synthesized from
 * normalized legacy {@link GatewayConfig}.
 */
export function extractPublicProvidersWireFromConfigRaw(
  raw: unknown,
  normalized: GatewayConfig
): BnbZkIdGatewayConfigProviderWire[] {
  if (isRecord(raw) && isBrevisGatewayConfigShape(raw)) {
    return brevisWireToPublicProviders(raw);
  }

  return normalized.providers.map(
    (p): BnbZkIdGatewayConfigProviderWire => ({
      id: p.providerId,
      properties: p.identityProperties.map(
        (ip): BnbZkIdGatewayConfigPropertyWire => {
          const businessParams =
            ip.businessParams !== undefined ? { ...ip.businessParams } : undefined;
          return {
            id: ip.identityPropertyId,
            ...(ip.description !== undefined && ip.description.trim() !== ""
              ? { description: ip.description.trim() }
              : {}),
            ...(businessParams !== undefined ? { businessParams } : {})
          };
        }
      )
    })
  );
}
