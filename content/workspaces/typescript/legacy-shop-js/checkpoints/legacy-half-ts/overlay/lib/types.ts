// The shop's data, as types: what a product, a cart, and a coupon look like. They describe what
// the code expects. Nothing checks data/products.json against them yet.
export type Product = {
  sku: string;
  name: string;
  price: number;
  salePercent?: number;
  stock: number;
};

export type CartItem = {
  sku: string;
  name: string;
  price: number;
  salePercent?: number;
  qty: number;
};

export type Cart = {
  id: string;
  items: CartItem[];
  coupon: string | null;
  vip: boolean;
  freeShipping?: boolean;
};

// A coupon is one of three kinds, and each kind has its own fields.
export type Coupon =
  | { code: string; type: "percent"; percent: number; endsAt?: string; vipOnly?: boolean }
  | { code: string; type: "fixed"; amount: number; minSpend: number; endsAt?: string }
  | { code: string; type: "free_shipping"; endsAt?: string };
