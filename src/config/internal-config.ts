import type { BnbZkIdConfigFile } from "./types.js";

const INTERNAL_GATEWAY_BASE_URL = "https://your-gateway-host.example.com";

export const INTERNAL_BNB_ZKID_CONFIG: BnbZkIdConfigFile = {
  gateway: {
    mode: "http",
    baseUrl: INTERNAL_GATEWAY_BASE_URL
  },
  primus: {
    mode: "sdk",
    templateResolver: {
      mode: "server",
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    },
    signer: {
      mode: "server",
      baseUrl: "https://api-dev.padolabs.org",
      signPath: "/developer-center/app-sign-by-app-id"
    }
  }
};
