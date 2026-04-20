import { SdkError } from "../errors/sdk-error.js";
import { joinBaseUrlAndPath } from "../util/join-base-url.js";

export interface WhitelistCheckerConfig {
  baseUrl: string;
  checkPath: string;
}

export interface WhitelistCheckInput {
  address: string;
  sourceAppId: string;
}

export interface WhitelistCheckResponse {
  rc?: unknown;
  mc?: unknown;
  msg?: unknown;
  result?: unknown;
}

export interface WhitelistChecker {
  check(input: WhitelistCheckInput): Promise<WhitelistCheckResponse>;
}

class HttpWhitelistChecker implements WhitelistChecker {
  constructor(private readonly config: WhitelistCheckerConfig) {}

  async check(input: WhitelistCheckInput): Promise<WhitelistCheckResponse> {
    const url = joinBaseUrlAndPath(this.config.baseUrl, this.config.checkPath);
    url.searchParams.set("address", input.address);
    url.searchParams.set("sourceAppId", input.sourceAppId);

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new SdkError("Whitelist checker request failed.", "TRANSPORT_ERROR", {
        status: response.status
      });
    }

    return (await response.json()) as WhitelistCheckResponse;
  }
}

export function createHttpWhitelistChecker(config: WhitelistCheckerConfig): WhitelistChecker {
  return new HttpWhitelistChecker(config);
}
