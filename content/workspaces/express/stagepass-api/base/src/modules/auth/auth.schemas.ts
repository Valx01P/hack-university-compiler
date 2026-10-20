// What auth requests may contain, and the JSON auth responses have (also used for OpenAPI).
import { z } from "zod";
import { roles } from "../../db/schema.ts";

// Stored lowercase, so the same address always finds the same account.
export const Email = z.string().trim().toLowerCase().pipe(z.email("Expected an email address").max(254));

export const Signup = z.strictObject({
  email: Email,
  name: z.string().trim().min(1).max(80),
  // Length beats complexity rules. 128 caps the work a single login can cost the server.
  password: z.string().min(12, "Use at least 12 characters").max(128, "Use at most 128 characters"),
});
export type Signup = z.infer<typeof Signup>;

export const Login = z.strictObject({
  email: Email,
  password: z.string().min(1).max(128),
});
export type Login = z.infer<typeof Login>;

export const RefreshTokenBody = z.strictObject({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshTokenBody = z.infer<typeof RefreshTokenBody>;

export const UserResponse = z.object({
  id: z.int(),
  email: z.string(),
  name: z.string(),
  role: z.enum(roles),
  createdAt: z.iso.datetime(),
});

export const SessionResponse = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string(),
  expiresIn: z.int().describe("Seconds until the access token expires"),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
  user: UserResponse,
});
