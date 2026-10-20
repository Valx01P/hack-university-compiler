// createClient: the SDK's front door. Each method is one Parcelly endpoint, with the right
// schema for its answer and retries for the failures that pass. Nothing here builds a URL by
// hand or reads a body without a schema: http.ts does both.
import type * as z from "zod";
import { request, type HttpConfig } from "./http.ts";
import { paginate } from "./paginate.ts";
import { withRetry, type RetryOptions } from "./retry.ts";
import { CarrierList } from "./schemas/carrier.ts";
import { EventList } from "./schemas/event.ts";
import { Shipment, ShipmentPage } from "./schemas/shipment.ts";
import type { Carrier, Page, Shipment as ShipmentType, ShipmentId, ShipmentStatus, TrackingEvent } from "./types.ts";

export type ClientOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** How long one request may take. 5 seconds by default. */
  readonly timeoutMs?: number;
  /** 3 tries, starting at 100 ms, by default. */
  readonly retry?: Partial<RetryOptions>;
  /** Defaults to the global fetch. Tests can pass their own. */
  readonly fetch?: typeof fetch;
  /** Sent with every request (the mock reads its chaos headers from here). */
  readonly headers?: Readonly<Record<string, string>>;
};

export type ShipmentFilter = { readonly status?: ShipmentStatus };

export function createClient(options: ClientOptions) {
  const config: HttpConfig = {
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs ?? 5000,
    fetch: options.fetch ?? fetch,
    headers: options.headers ?? {},
  };
  const retry: RetryOptions = {
    attempts: options.retry?.attempts ?? 3,
    baseDelayMs: options.retry?.baseDelayMs ?? 100,
    ...(options.retry?.sleep ? { sleep: options.retry.sleep } : {}),
  };
  // Every endpoint is a GET, which is safe to retry: asking twice changes nothing.
  const get = <S extends z.ZodType>(path: string, schema: S, query?: Readonly<Record<string, string | undefined>>): Promise<z.output<S>> =>
    withRetry(() => request(config, path, schema, query), retry);

  const list = (filter: ShipmentFilter & { readonly limit?: number; readonly cursor?: string | null } = {}): Promise<Page<ShipmentType>> =>
    get("/v1/shipments", ShipmentPage, { status: filter.status, limit: String(filter.limit ?? 5), cursor: filter.cursor ?? undefined });

  return {
    shipments: {
      get: (id: ShipmentId): Promise<ShipmentType> => get(`/v1/shipments/${id}`, Shipment),
      list,
      /** Every shipment (matching the filter), page by page, as the caller iterates. */
      all: (filter: ShipmentFilter = {}, pageSize = 5): AsyncGenerator<ShipmentType> =>
        paginate((cursor) => list({ ...filter, limit: pageSize, cursor })),
      // TODO (lesson 34, part 4): getV2(id) for GET /v2/shipments/:id, returning the same Shipment.
    },
    events: {
      list: async (id: ShipmentId): Promise<TrackingEvent[]> => (await get(`/v1/shipments/${id}/events`, EventList)).items,
    },
    carriers: {
      list: async (): Promise<Carrier[]> => (await get("/v1/carriers", CarrierList)).items,
    },
  };
}

export type ParcellyClient = ReturnType<typeof createClient>;
