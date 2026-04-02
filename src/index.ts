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
  InitFailureResult,
  InitResult,
  InitSuccessResult,
  ProveInput,
  ProveOptions,
  ProveProgressEvent,
  ProveResult,
  ProveSuccessResult,
  ProveStatus,
  ProvingParams
} from "./types/public.js";
export { BnbZkIdProveError } from "./errors/prove-error.js";
export type { BnbZkIdProveErrorCode } from "./errors/prove-error.js";
export { SdkError, ConfigurationError, NotImplementedError } from "./errors/sdk-error.js";
