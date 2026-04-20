import type { PrimusZkTlsRuntime } from "./types.js";

export async function loadPrimusZkTlsRuntime(): Promise<PrimusZkTlsRuntime> {
  const { PrimusZKTLS } = await import("@primuslabs/zktls-js-sdk");
  return new PrimusZKTLS();
}
