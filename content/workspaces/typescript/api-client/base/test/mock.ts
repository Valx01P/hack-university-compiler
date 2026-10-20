// Starts the Parcelly mock on a free port (port 0) for one test file, with its random latency
// off so tests stay fast. calls records every request the mock received, so a test can
// count them: a 404 must be asked for once, never retried.
import { createMockServer, type MockCall, type MockOptions } from "../mock-api/server.ts";
import { createClient, type ClientOptions, type ParcellyClient } from "../src/index.ts";

export type TestMock = {
  readonly baseUrl: string;
  readonly calls: MockCall[];
  readonly close: () => Promise<void>;
  /** A client for this mock. Pass sleep to record the waits instead of waiting. */
  readonly client: (options?: Partial<ClientOptions>) => ParcellyClient;
};

export async function startMock(options: MockOptions = {}): Promise<TestMock> {
  const { server, calls } = createMockServer({ latency: false, ...options });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // address() is a string for a pipe and null before listening, so narrow it before .port.
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("The mock is not on TCP");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
    client: (overrides = {}) => createClient({ apiKey: "test_key_123", baseUrl, retry: { sleep: () => Promise.resolve() }, ...overrides }),
  };
}
