import { createRuntimeConfiguredClient } from "./runtime-client.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitResult,
  ProveInput,
  ProveOptions,
  ProveResult
} from "../types/public.js";

export class BnbZkIdClient implements BnbZkIdClientMethods {
  private runtimeClientPromise: Promise<BnbZkIdClientMethods> | undefined;

  constructor() {}

  async init(input: InitInput): Promise<InitResult> {
    const runtimeClient = await this.getRuntimeClient();
    return runtimeClient.init(input);
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult> {
    if (!this.runtimeClientPromise) {
      return {
        status: "failed",
        clientRequestId: input.clientRequestId,
        error: {
          code: "CONFIGURATION_ERROR",
          message: "init must succeed before prove can run."
        }
      };
    }

    const runtimeClient = await this.runtimeClientPromise;
    return runtimeClient.prove(input, options);
  }

  private async getRuntimeClient(): Promise<BnbZkIdClientMethods> {
    if (!this.runtimeClientPromise) {
      this.runtimeClientPromise = createRuntimeConfiguredClient();
    }

    return this.runtimeClientPromise;
  }
}
