// Retries a call that failed in a way worth retrying (isRetryable), waiting longer each time:
// baseDelayMs, then twice that, then four times. When Parcelly says how long to wait
// (Retry-After), that wins. sleep is injected, so a test can record the delays instead of
// waiting for them.
export type RetryOptions = {
  /** How many tries in all, the first one included. */
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

// TODO (lesson 34, part 2): retry while isRetryable(error) says so and attempts remain,
// waiting error.retryAfterMs when Parcelly sent one, or else baseDelayMs * 2 ** (attempt - 1).
// For now every call is tried exactly once.
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  if (options.attempts < 1) throw new RangeError("attempts must be at least 1");
  return await fn();
}
