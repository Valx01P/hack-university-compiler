// Every way a call to Parcelly can fail, as one error class with a kind. A caller switches on
// kind instead of parsing messages, and isRetryable says which kinds are worth another try.
export type ParcellyErrorKind = "http" | "rate_limited" | "validation" | "network" | "timeout";

export type ParcellyErrorDetails = {
  /** The HTTP status, for http and rate_limited. */
  readonly status?: number;
  /** Parcelly's error code from the envelope, such as not_found. */
  readonly code?: string;
  readonly requestId?: string;
  /** How long Parcelly asked us to wait, from Retry-After, in milliseconds. */
  readonly retryAfterMs?: number;
  /** For validation: which fields of the body did not match, and why. */
  readonly issues?: readonly string[];
  readonly cause?: unknown;
};

export class ParcellyError extends Error {
  readonly kind: ParcellyErrorKind;
  readonly details: ParcellyErrorDetails;

  constructor(kind: ParcellyErrorKind, message: string, details: ParcellyErrorDetails = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "ParcellyError";
    this.kind = kind;
    this.details = details;
  }

  get status(): number | undefined {
    return this.details.status;
  }

  get retryAfterMs(): number | undefined {
    return this.details.retryAfterMs;
  }
}

// 502, 503, and 504 mean "the server or something in front of it is struggling", which often
// passes. Any other 4xx or 5xx will fail the same way again.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/** Whether a failed GET is worth retrying: rate limits, network trouble, timeouts, 502 to 504. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ParcellyError)) return false;
  switch (error.kind) {
    case "rate_limited":
    case "network":
    case "timeout":
      return true;
    case "http":
      return error.status !== undefined && TRANSIENT_STATUSES.has(error.status);
    case "validation":
      return false;
  }
}
