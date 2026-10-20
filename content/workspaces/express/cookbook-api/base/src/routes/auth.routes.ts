// Authentication routes: signup and login (both start a fresh session), logout, the current
// user, and the password-reset pair.
import { Router } from "express";
import * as auth from "../controllers/auth.controller.ts";
import { requireUser } from "../middleware/require-user.ts";
import { validate } from "../middleware/validate.ts";
import { ForgotPasswordBody, LoginBody, ResetPasswordBody, SignupBody } from "../schemas/auth.schemas.ts";

export const authRouter: Router = Router();

authRouter.post("/signup", validate({ body: SignupBody }), auth.signup);
authRouter.post("/login", validate({ body: LoginBody }), auth.login);
authRouter.post("/logout", auth.logout);
authRouter.get("/me", requireUser, auth.me);
authRouter.post("/forgot-password", validate({ body: ForgotPasswordBody }), auth.forgotPassword);
authRouter.post("/reset-password", validate({ body: ResetPasswordBody }), auth.resetPassword);
