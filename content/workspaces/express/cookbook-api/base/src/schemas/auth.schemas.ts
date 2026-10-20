// What the auth routes accept. Zod checks and coerces the request body before any controller or
// service runs, so a password that is too short or a missing email is a clean 400.
import * as z from "zod";

export const SignupBody = z.strictObject({
  email: z.email(),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(200),
});

export const LoginBody = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export const ForgotPasswordBody = z.strictObject({
  email: z.email(),
});

export const ResetPasswordBody = z.strictObject({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const UpdateMeBody = z.strictObject({
  name: z.string().trim().min(2).max(80),
});

export type SignupInput = z.infer<typeof SignupBody>;
export type LoginInput = z.infer<typeof LoginBody>;
