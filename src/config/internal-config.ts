import type { BnbZkIdConfigFile } from "./types.js";

const INTERNAL_GATEWAY_BASE_URL = "https://your-gateway-host.example.com";
const INTERNAL_ZKTLS_APP_ID = "YOUR_ZKTLS_APP_ID";

export const INTERNAL_BNB_ZKID_CONFIG: BnbZkIdConfigFile = {
  gateway: {
    mode: "http",
    baseUrl: INTERNAL_GATEWAY_BASE_URL
  },
  primus: {
    mode: "sdk",
    zktlsAppId: "0x3d5593083e9c7055de9760c80eebf156e39ba3e8"
  },
  provingDataRegistry: {}
};
