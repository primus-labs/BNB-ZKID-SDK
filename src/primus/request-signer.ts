import { SdkError } from "../errors/sdk-error.js";
import type { PrimusRequestSigner } from "./types.js";

export interface PrimusServerRequestSignerConfig {
  baseUrl: string;
  signPath: string;
  apiKey?: string;
}

interface PrimusServerSignResponse {
  rc?: unknown;
  mc?: unknown;
  msg?: unknown;
  result?: {
    appSignature?: unknown;
  };
}

class HttpPrimusRequestSigner implements PrimusRequestSigner {
  constructor(private readonly config: PrimusServerRequestSignerConfig) {}

  async sign(signParams: string): Promise<string> {
    const response = await fetch(new URL(this.config.signPath, this.config.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        ...(this.config.apiKey === undefined ? {} : { "x-api-key": this.config.apiKey })
      },
      body: signParams
    });

    if (!response.ok) {
      throw new SdkError("Unable to sign Primus attestation request.", "TRANSPORT_ERROR", {
        status: response.status
      });
    }

    const payload = (await response.json()) as PrimusServerSignResponse;
    if (
      payload.rc !== 0 ||
      typeof payload.result?.appSignature !== "string" ||
      payload.result.appSignature.trim().length === 0
    ) {
      throw new SdkError("Primus signer returned an invalid appSignature.", "VALIDATION_ERROR");
    }

    return JSON.stringify({
      attRequest: JSON.parse(signParams),
      appSignature: payload.result.appSignature.trim()
    });
  }
}

export function createHttpPrimusRequestSigner(
  config: PrimusServerRequestSignerConfig
): PrimusRequestSigner {
  return new HttpPrimusRequestSigner(config);
}
