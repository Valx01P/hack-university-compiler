// The product controllers: the catalog, one product, and whether a product is in stock.
import { isSku, type Sku } from "#domain/ids.ts";
import type { ProductService } from "#services/product-service.ts";
import type { RequestContext } from "../context.ts";
import { HttpError, sendDomainError } from "../errors.ts";
import { json } from "../respond.ts";
import { presentAvailability, presentProduct } from "../views/product-view.ts";

function skuFrom(text: string): Sku {
  if (!isSku(text)) throw new HttpError(404, `No product with SKU ${text}`);
  return text;
}

export function productControllers(products: ProductService) {
  return {
    list: (ctx: RequestContext) => {
      json(ctx.res, 200, { items: products.listProducts().map(presentProduct) });
    },

    get: (ctx: RequestContext<{ readonly sku: string }>) => {
      const result = products.getProduct(skuFrom(ctx.params.sku));
      if (result.ok) json(ctx.res, 200, presentProduct(result.value));
      else sendDomainError(ctx.res, result.error);
    },

    availability: (ctx: RequestContext<{ readonly sku: string }>) => {
      const result = products.getAvailability(skuFrom(ctx.params.sku));
      if (result.ok) json(ctx.res, 200, presentAvailability(result.value));
      else sendDomainError(ctx.res, result.error);
    },
  };
}
