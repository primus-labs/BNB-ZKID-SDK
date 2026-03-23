import { NotImplementedError } from "../errors/sdk-error.js";
import type {
  BnbZkIdClientMethods,
  ClientConfig,
  QueryInput,
  QueryResult,
  ProveInput,
  ProveResult
} from "../types/public.js";

export class BnbZkIdClient implements BnbZkIdClientMethods {
  readonly config: ClientConfig;

  constructor(config: ClientConfig = {}) {
    this.config = config;
  }

  async init(): Promise<boolean> {
    throw new NotImplementedError("`init` is not implemented yet. Current phase only defines the facade contract.");
  }

  async prove(_input: ProveInput): Promise<ProveResult> {
    throw new NotImplementedError("`prove` is not implemented yet. Current phase only defines the facade contract.");
  }

  async query(_input: QueryInput): Promise<QueryResult> {
    throw new NotImplementedError("`query` is not implemented yet. Current phase only defines the facade contract.");
  }
}
