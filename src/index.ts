export { BnbZkIdClient } from "./client/client.js";
export type {
  BnbZkIdClientMethods,
  BnbZkIdError,
  BnbZkIdFrameworkError,
  BnbZkIdFrameworkErrorCategory,
  BnbZkIdGatewayConfigPropertyWire,
  BnbZkIdGatewayConfigProviderWire,
  BusinessParams,
  InitInput,
  InitSuccessResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveResult,
  ProveSuccessResult,
  ProveStatus,
  ProvingParams,
  QueryProofResultInput,
  QueryProofResultResult,
  QueryProofResultSuccessResult
} from "./types/public.js";
export { BnbZkIdProveError } from "./errors/prove-error.js";
export type { BnbZkIdProveErrorCode } from "./errors/prove-error.js";
export { SdkError, ConfigurationError, NotImplementedError } from "./errors/sdk-error.js";
