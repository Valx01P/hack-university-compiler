// Ways to make the mock misbehave on purpose, one request header each, so the tests (and you,
// from the API panel) can see what the SDK does with a flaky vendor. Counts are kept per
// path and header value, so "fail twice" means the first two such requests fail and the
// third one works.
//
//   x-mock-fail: 503x2       the first 2 matching requests answer 503 (any status: 500x1, 422x1)
//   x-mock-rate-limit: 2     the first matching request answers 429 with Retry-After: 2
//   x-mock-delay: 1500       waits 1500 ms before answering, to trigger a client's timeout
//   x-mock-garbage: 1        answers 200 with a body that breaks the contract
export type ChaosAction =
  | { readonly kind: "fail"; readonly status: number }
  | { readonly kind: "rate_limit"; readonly retryAfterSeconds: number }
  | { readonly kind: "garbage" };

type Headers = Readonly<Record<string, string | string[] | undefined>>;

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function createChaos() {
  const seen = new Map<string, number>();
  // How many times this path has been asked for with this header value, counting this time.
  const count = (key: string): number => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n;
  };
  return {
    /** What to do instead of answering normally, or null to answer normally. */
    decide(path: string, headers: Headers): ChaosAction | null {
      const fail = header(headers, "x-mock-fail");
      const failMatch = fail === undefined ? null : /^(\d{3})x(\d+)$/.exec(fail);
      if (failMatch) {
        const [, status = "503", times = "1"] = failMatch;
        if (count(`fail ${path} ${fail}`) <= Number(times)) return { kind: "fail", status: Number(status) };
      }
      const rateLimit = header(headers, "x-mock-rate-limit");
      if (rateLimit !== undefined && /^\d+$/.test(rateLimit) && count(`rate ${path} ${rateLimit}`) === 1) {
        return { kind: "rate_limit", retryAfterSeconds: Number(rateLimit) };
      }
      if (header(headers, "x-mock-garbage") === "1") return { kind: "garbage" };
      return null;
    },
    /** Extra milliseconds to wait before answering. */
    delayMs(headers: Headers): number {
      const delay = header(headers, "x-mock-delay");
      return delay !== undefined && /^\d+$/.test(delay) ? Number(delay) : 0;
    },
  };
}
