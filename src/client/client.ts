import { NotImplementedError } from "../errors/sdk-error.js";
import type {
  BnbZkIdClientMethods,
  ClientConfig,
  InitInput,
  InitResult,
  ProveInput,
  ProveOptions,
  ProveResult
} from "../types/public.js";

export class BnbZkIdClient implements BnbZkIdClientMethods {
  readonly config: ClientConfig;

  constructor(config: ClientConfig = {}) {
    this.config = config;
  }

  async init(input: InitInput): Promise<InitResult> {
    void input;
    throw new NotImplementedError("`init` is not implemented yet. Current phase only defines the facade contract.");
  }

  async prove(input: ProveInput, options?: ProveOptions): Promise<ProveResult> {
    void input;
    void options;
    throw new NotImplementedError("`prove` is not implemented yet. Current phase only defines the facade contract.");
  }
}
