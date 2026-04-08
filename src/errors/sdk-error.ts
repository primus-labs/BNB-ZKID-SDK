/** Gateway proof-request GET / poll body: Framework top-level `error` (API/query), not lifecycle `failure`. */
export const GATEWAY_API_ERROR_CODE = "GATEWAY_API_ERROR" as const;

export class SdkError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ConfigurationError extends SdkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIGURATION_ERROR", details);
  }
}

export class NotImplementedError extends SdkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NOT_IMPLEMENTED", details);
  }
}
