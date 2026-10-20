// Retries a call that failed in a way worth retrying (isRetryable), waiting longer each time:
// baseDelayMs, then twice that, then four times. When Parcelly says how long to wait
// (Retry-After), that wins. sleep is injected, so a test can record the delays instead of
// waiting for them.
import { isRetryable, ParcellyError } from "./errors.ts";

export type RetryOptions = {
  /** How many tries in all, the first one included. */
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? realSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.attempts || !isRetryable(error)) throw error;
      const asked = error instanceof ParcellyError ? error.retryAfterMs : undefined;
      await sleep(asked ?? options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
