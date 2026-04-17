import { createRuntimeConfiguredClient } from "./runtime-client.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitSuccessResult,
  ProveInput,
  ProveOptions,
  ProveSuccessResult
} from "../types/public.js";

export class BnbZkIdClient implements BnbZkIdClientMethods {
  private runtimeClientPromise: Promise<BnbZkIdClientMethods> | undefined;

  constructor() {}

  async init(input: InitInput): Promise<InitSuccessResult> {
    const runtimeClient = await this.getRuntimeClient();
    return runtimeClient.init(input);
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult> {
    const runtimeClient = await this.getRuntimeClient();
    return runtimeClient.prove(input, options);
  }

  private async getRuntimeClient(): Promise<BnbZkIdClientMethods> {
    if (!this.runtimeClientPromise) {
      this.runtimeClientPromise = createRuntimeConfiguredClient();
    }

    return this.runtimeClientPromise;
  }
}
