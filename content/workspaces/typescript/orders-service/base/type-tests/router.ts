// Compile-only tests of the typed router: npm run typecheck compiles this file and nothing
// runs it. Each @ts-expect-error must really be an error, or tsc reports TS2578.
import { createRouter, type ExtractParams } from "#http/router.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type OneParam = Expect<Equal<ExtractParams<"/orders/:id">["id"], string>>;
export type TwoParams = Expect<Equal<keyof ExtractParams<"/customers/:customerId/orders/:id">, "customerId" | "id">>;

const router = createRouter();

router.get("/orders/:id", (ctx) => {
  ctx.log.info(ctx.params.id);
  // @ts-expect-error -- the pattern names the param id, not orderId
  ctx.log.info(ctx.params.orderId);
});

router.get("/health", (ctx) => {
  // @ts-expect-error -- a pattern without :params gives no params at all
  ctx.log.info(ctx.params.id);
});
