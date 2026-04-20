import type { BnbZkIdConfigFile } from "./types.js";

const INTERNAL_GATEWAY_BASE_URL = "https://zk-id.brevis.network";
// const INTERNAL_GATEWAY_BASE_URL = "http://44.226.158.196:8038";
export const INTERNAL_PADOLABS_BASE_URL = "https://dev.padolabs.org";

export const INTERNAL_BNB_ZKID_CONFIG: BnbZkIdConfigFile = {
  gateway: {
    mode: "http",
    baseUrl: INTERNAL_GATEWAY_BASE_URL
  },
  primus: {
    mode: "sdk",
    whitelist: {
      baseUrl: INTERNAL_PADOLABS_BASE_URL,
      checkPath: "/public/zkid/whitelist/check"
    },
    templateResolver: {
      mode: "server",
      baseUrl: INTERNAL_PADOLABS_BASE_URL,
      resolveTemplatePath: "/public/identity/templates"
    },
    signer: {
      mode: "server",
      baseUrl: INTERNAL_PADOLABS_BASE_URL,
      signPath: "/developer-center/app-sign-by-app-id"
    }
  }
};
