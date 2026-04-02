/**
 * Brevis `GET /v1/config` wire — `providers[].properties[]` (public mirror of Gateway payload).
 * Also returned for legacy normalized configs by synthesizing from {@link import("../gateway/types.js").GatewayConfig}.
 */

export interface BnbZkIdGatewayConfigPropertyWire {
  id: string;
  description?: string;
  businessParams?: Record<string, unknown>;
}

export interface BnbZkIdGatewayConfigProviderWire {
  id: string;
  description?: string;
  properties: BnbZkIdGatewayConfigPropertyWire[];
}
