import type { GatewayCreateProofRequestInput } from "./types.js";

export interface GatewayCreateProofRequestDebugEvent {
  channel: "createProofRequest";
  transport: "http" | "fixture";
  input: GatewayCreateProofRequestInput;
}

type GlobalWithGatewayDebug = typeof globalThis & {
  __BNB_ZKID_GATEWAY_DEBUG__?: (event: GatewayCreateProofRequestDebugEvent) => void;
};

export function emitGatewayCreateProofRequestDebug(
  event: GatewayCreateProofRequestDebugEvent
): void {
  const hook = (globalThis as GlobalWithGatewayDebug).__BNB_ZKID_GATEWAY_DEBUG__;
  if (hook) {
    hook(event);
    return;
  }

  if (typeof window !== "undefined") {
    console.info("[bnb-zkid-sdk] gateway createProofRequest", event);
  }
}
