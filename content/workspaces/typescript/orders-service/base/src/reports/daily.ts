// The daily report: the orders placed on one day and what they are worth, by status, plus the
// revenue (orders that were paid, whether or not they shipped). It reads across tables in one
// statement, so it is a query of its own rather than a job for the order repository, which
// works one order at a time.
import type { DatabaseSync } from "node:sqlite";
import * as z from "zod";
import { addCents, cents, formatCents, ZERO_CENTS } from "#domain/money.ts";
import { ORDER_STATUSES, type OrderStatus } from "#domain/order.ts";
import { countQuery } from "#repositories/sqlite/query-counter.ts";

export type DailyReport = {
  readonly date: string;
  readonly orders: number;
  readonly byStatus: Record<OrderStatus, { readonly orders: number; readonly total: string }>;
  readonly revenue: string;
};

const StatusRow = z.object({ status: z.enum(ORDER_STATUSES), orders: z.number().int(), total_cents: z.number().int() });

const EARNED: readonly OrderStatus[] = ["paid", "shipped", "delivered"];

export function dailyReport(db: DatabaseSync, date: string): DailyReport {
  countQuery();
  const rows = db
    .prepare(
      `SELECT o.status, COUNT(DISTINCT o.id) AS orders, SUM(l.quantity * l.unit_price_cents) AS total_cents
         FROM orders o JOIN order_lines l ON l.order_id = o.id
        WHERE substr(o.created_at, 1, 10) = ?
        GROUP BY o.status`,
    )
    .all(date)
    .map((row) => StatusRow.parse(row));
  const byStatus = noOrders();
  let orders = 0;
  let revenue = ZERO_CENTS;
  for (const row of rows) {
    byStatus[row.status] = { orders: row.orders, total: formatCents(cents(row.total_cents)) };
    orders += row.orders;
    if (EARNED.includes(row.status)) revenue = addCents(revenue, cents(row.total_cents));
  }
  return { date, orders, byStatus, revenue: formatCents(revenue) };
}

function noOrders(): Record<OrderStatus, { orders: number; total: string }> {
  const none = { orders: 0, total: formatCents(ZERO_CENTS) };
  return { pending: none, paid: none, shipped: none, delivered: none, cancelled: none };
}
