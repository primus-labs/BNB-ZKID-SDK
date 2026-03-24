import type { PrimusZkTlsRuntime } from "./types.js";

export async function loadPrimusZkTlsRuntime(): Promise<PrimusZkTlsRuntime> {
  const module = (await import("@primuslabs/zktls-js-sdk")) as {
    PrimusZKTLS: new () => PrimusZkTlsRuntime;
  };

  return new module.PrimusZKTLS();
}
