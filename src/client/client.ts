import { createBnbZkIdProveError } from "../errors/prove-error.js";
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
      throw createBnbZkIdProveError(
        "00001",
        { reason: "init_must_succeed_before_prove" },
        { clientRequestId: input.clientRequestId }
      );
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
