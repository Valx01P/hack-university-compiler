// The shop's data, as types. Money is whole cents everywhere inside the app (299 is $2.99),
// and only the API's edges turn it into dollars.
export type Product = {
  sku: string;
  name: string;
  priceCents: number;
  salePercent?: number;
  stock: number;
};

export type CartItem = {
  sku: string;
  name: string;
  priceCents: number;
  salePercent?: number;
  qty: number;
};

export type Cart = {
  id: string;
  items: readonly CartItem[];
  coupon: string | null;
  vip: boolean;
};

// A coupon is one of three kinds, and each kind has its own fields.
export type Coupon =
  | { code: string; type: "percent"; percent: number; endsAt?: string; vipOnly?: boolean }
  | { code: string; type: "fixed"; amountCents: number; minSpendCents: number; endsAt?: string }
  | { code: string; type: "free_shipping"; endsAt?: string };

export type Totals = {
  lines: string[];
  subtotal: string;
  discount: string;
  tax: string;
  shipping: string;
  total: string;
};
