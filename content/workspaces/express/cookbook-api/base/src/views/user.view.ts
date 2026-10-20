// Turns a User document into the JSON a client sees: never the password hash or the reset
// fields. Used for /api/auth/me and inside other views when an author is populated.
import type { User } from "../models/user.model.ts";

export type UserView = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export function presentUser(user: User): UserView {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
