import { createProveBeforeInitError } from "../errors/prove-error.js";
import { createRuntimeConfiguredClient } from "./runtime-client.js";
import type {
  BnbZkIdClientMethods,
  InitInput,
  InitResult,
  ProveInput,
  ProveOptions,
  ProveSuccessResult
} from "../types/public.js";

export class BnbZkIdClient implements BnbZkIdClientMethods {
  private runtimeClientPromise: Promise<BnbZkIdClientMethods> | undefined;

  constructor() {}

  async init(input: InitInput): Promise<InitResult> {
    const runtimeClient = await this.getRuntimeClient();
    return runtimeClient.init(input);
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveSuccessResult> {
    if (!this.runtimeClientPromise) {
      const err = createProveBeforeInitError(input.clientRequestId);
      await options?.onProgress?.({
        status: "failed",
        clientRequestId: err.clientRequestId ?? input.clientRequestId.trim()
      });
      throw err;
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
