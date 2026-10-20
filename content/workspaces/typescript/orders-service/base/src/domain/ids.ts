// Ids as brands. An OrderId is a string that has been checked against ord_0001's shape, so a
// customer id can never be passed where an order id is expected, even though both are strings.
export type OrderId = string & { readonly __brand: "OrderId" };
export type CustomerId = string & { readonly __brand: "CustomerId" };
export type Sku = string & { readonly __brand: "Sku" };

const ORDER_ID = /^ord_\d{4,}$/;
const CUSTOMER_ID = /^cus_\d{2,}$/;
// COF-ETH-250, COF-ESP-1KG, GEA-V60-02: a family, a product, and a size or variant.
const SKU = /^[A-Z]{3}-[A-Z0-9]{3}-[A-Z0-9]{2,3}$/;

export function isOrderId(text: string): text is OrderId {
  return ORDER_ID.test(text);
}

export function isCustomerId(text: string): text is CustomerId {
  return CUSTOMER_ID.test(text);
}

export function isSku(text: string): text is Sku {
  return SKU.test(text);
}

/** The order id for a sequence number: 13 becomes ord_0013. */
export function orderIdFor(sequence: number): OrderId {
  const id = `ord_${String(sequence).padStart(4, "0")}`;
  if (!isOrderId(id)) throw new RangeError(`Not an order sequence number: ${sequence}`);
  return id;
}
