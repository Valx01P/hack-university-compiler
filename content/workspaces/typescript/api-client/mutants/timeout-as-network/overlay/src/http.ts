// The one place the SDK calls fetch. It adds the base URL, the API key, and a timeout, treats
// every body as unknown until a schema has checked it, and turns each kind of failure into a
// ParcellyError: network, timeout, http (with the envelope's code), rate_limited (with
// Retry-After in milliseconds), and validation (a body that breaks the contract).
import type * as z from "zod";
import { ParcellyError } from "./errors.ts";
import { ErrorEnvelope } from "./schemas/error.ts";

export type HttpConfig = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetch: typeof fetch;
  readonly headers: Readonly<Record<string, string>>;
};

/** Retry-After is seconds ("2") or an HTTP date. Both become milliseconds from now. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

export async function request<S extends z.ZodType>(
  config: HttpConfig,
  path: string,
  schema: S,
  query: Readonly<Record<string, string | undefined>> = {},
): Promise<z.output<S>> {
  const url = new URL(path, config.baseUrl);
  for (const [name, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(name, value);

  let res: Response;
  try {
    res = await config.fetch(url, {
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json", ...config.headers },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new ParcellyError("network", `Could not reach Parcelly at ${url.origin}`, { cause: error });
  }

  // res.json() is typed any. Keeping it as unknown makes the compiler insist on a check.
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const envelope = ErrorEnvelope.safeParse(body);
    const details = envelope.success ? { code: envelope.data.error.code, requestId: envelope.data.error.requestId } : {};
    const message = envelope.success ? envelope.data.error.message : `GET ${path} failed with ${res.status}`;
    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    if (res.status === 429) {
      throw new ParcellyError("rate_limited", message, { status: 429, ...details, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
    }
    throw new ParcellyError("http", message, { status: res.status, ...details });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(body)"}: ${issue.message}`);
    throw new ParcellyError("validation", `Parcelly's answer to GET ${path} does not match the contract`, { issues });
  }
  return parsed.data;
}
