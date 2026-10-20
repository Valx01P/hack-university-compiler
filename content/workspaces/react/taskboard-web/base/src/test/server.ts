// The fake network for tests: MSW intercepts fetch in Node and answers from handlers.ts. A test
// changes one answer with server.use(...) (a 500, an empty list, a slow response); setup.ts puts
// the handlers back after each test.
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
