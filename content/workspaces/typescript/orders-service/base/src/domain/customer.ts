// The Customer model. Emails are compared after normalizeEmail, so " Ada@Example.com " and
// "ada@example.com" are the same customer.
import type { CustomerId } from "./ids.ts";

export type Customer = {
  readonly id: CustomerId;
  readonly name: string;
  readonly email: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
