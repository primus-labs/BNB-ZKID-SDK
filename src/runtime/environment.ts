export function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

export function getGlobalConfigUrl(): string | undefined {
  const globalWithConfig = globalThis as typeof globalThis & {
    __BNB_ZKID_CONFIG_URL__?: string;
  };

  return globalWithConfig.__BNB_ZKID_CONFIG_URL__;
}
