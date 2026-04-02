/** Thrown when proof-request status polling exceeds the configured max duration. */
export class ProofRequestPollTimeoutError extends Error {
  override readonly name = "ProofRequestPollTimeoutError";
  readonly code = "TIMEOUT";

  constructor(
    readonly proofRequestId: string,
    readonly maxDurationMs: number,
    readonly elapsedMs: number
  ) {
    super("timeout");
  }
}
