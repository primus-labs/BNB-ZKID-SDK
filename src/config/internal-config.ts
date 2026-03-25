import type { BnbZkIdConfigFile } from "./types.js";

const INTERNAL_GATEWAY_BASE_URL = "https://your-gateway-host.example.com";
const INTERNAL_ZKTLS_APP_ID = "0x4f6caf43b3a9cf3104d67ddb850bc51a3846a5e2";

export const INTERNAL_BNB_ZKID_CONFIG: BnbZkIdConfigFile = {
  gateway: {
    mode: "http",
    baseUrl: INTERNAL_GATEWAY_BASE_URL
  },
  primus: {
    mode: "sdk",
    zktlsAppId: INTERNAL_ZKTLS_APP_ID,
    templateResolver: {
      mode: "server",
      baseUrl: "https://api-dev.padolabs.org",
      resolveTemplatePath: "/public/identity/templates"
    },
    signer: {
      mode: "server",
      baseUrl: "https://api-dev.padolabs.org",
      signPath: "/developer-center/app-sign-brevis"
    }
  }
};
