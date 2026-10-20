// npm run race -- --ticket-type 21 --n 10
// Fires n checkouts for one ticket type at the same moment against the running server
// (npm run dev), as Cam, then reads the row to show whether the seats held. With correct code
// event 7's Front Row (capacity 2, sold 1) prints "sold 2 of capacity 2, 9 sold out".
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import { DEMO_PASSWORD } from "./seed-data.ts";

const { values } = parseArgs({
  options: {
    "ticket-type": { type: "string", default: "21" },
    n: { type: "string", default: "10" },
    quantity: { type: "string", default: "1" },
  },
});
const ticketTypeId = Number(values["ticket-type"]);
const n = Number(values.n);
const quantity = Number(values.quantity);
const baseUrl = `http://localhost:${process.env.PORT ?? "3000"}`;

const login = await fetch(`${baseUrl}/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "cam@stagepass.test", password: DEMO_PASSWORD }),
}).catch(() => {
  console.error(`Nothing answers at ${baseUrl}. Start the server first: npm run dev`);
  process.exit(1);
});
if (!login.ok) throw new Error(`Login failed with ${login.status}: ${await login.text()}`);
const { accessToken } = (await login.json()) as { accessToken: string };

// A fresh key per order and per run, so no request is mistaken for a retry of another.
const run = randomUUID().slice(0, 8);
const statuses = await Promise.all(
  Array.from({ length: n }, (_, i) =>
    fetch(`${baseUrl}/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `race-${run}-${i}`,
      },
      body: JSON.stringify({ items: [{ ticketTypeId, quantity }] }),
    }).then((response) => response.status),
  ),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query<{ sold: number; capacity: number; paid: string }>(
  `SELECT t.sold, t.capacity,
          coalesce((SELECT sum(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                    WHERE i.ticket_type_id = t.id AND o.status = 'paid'), 0) AS paid
     FROM ticket_types t WHERE t.id = $1`,
  [ticketTypeId],
);
await pool.end();

const counts = new Map<number, number>();
for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
const row = rows[0];
if (row === undefined) throw new Error(`No ticket type ${ticketTypeId}`);
console.log(`sold ${row.sold} of capacity ${row.capacity}, ${counts.get(409) ?? 0} sold out`);
console.log(
  `paid orders hold ${row.paid} tickets (${[...counts].sort(([a], [b]) => a - b).map(([status, count]) => `${status}: ${count}`).join(", ")})`,
);
