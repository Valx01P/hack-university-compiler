// The auth controller: signup, login, logout, me, the password-reset pair, and the account
// edit and delete. Login gives the same 401 for an unknown email and a wrong password, so it
// never reveals which emails exist. A reset token is stored only as a SHA-256 hash, and the
// reset link is written to a mail_outbox collection instead of being emailed.
import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { now } from "../clock.ts";
import { UnauthorizedError, ValidationError } from "../errors.ts";
import { UserModel, type User } from "../models/user.model.ts";
import { deleteAccount } from "../services/account.service.ts";
import { presentUser } from "../views/user.view.ts";

function regenerateSession(req: Parameters<RequestHandler>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req: Parameters<RequestHandler>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const signup: RequestHandler = async (req, res) => {
  const user = await UserModel.create(req.body);
  await regenerateSession(req);
  req.session.userId = String(user._id);
  res.status(201).json(presentUser(user));
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await UserModel.findOne({ email }).select("+password");
  if (!user || !(await user.verifyPassword(password))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  await regenerateSession(req);
  req.session.userId = String(user._id);
  res.json(presentUser(user));
};

export const logout: RequestHandler = async (req, res) => {
  await destroySession(req);
  res.clearCookie(req.app.get("sessionCookieName") as string);
  res.status(204).end();
};

export const me: RequestHandler = (_req, res) => {
  res.json(presentUser(res.locals.user as User));
};

export const updateMe: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  user.name = (req.body as { name: string }).name;
  await user.save();
  res.json(presentUser(user));
};

export const deleteMe: RequestHandler = async (req, res) => {
  const user = res.locals.user as User;
  await deleteAccount(user._id);
  await destroySession(req);
  res.status(204).end();
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = req.body as { email: string };
  const user = await UserModel.findOne({ email });
  if (user) {
    const token = randomBytes(32).toString("hex");
    user.set({ resetTokenHash: sha256(token), resetTokenExpires: new Date(now().getTime() + 60 * 60 * 1000) });
    await user.save();
    await mongoose.connection.collection("mail_outbox").insertOne({
      to: user.email,
      kind: "password_reset",
      link: `/reset-password?token=${token}`,
      createdAt: now(),
    });
  }
  // Always the same answer, so the endpoint never reveals whether an email is registered.
  res.status(202).json({ status: "ok" });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  const user = await UserModel.findOne({ resetTokenHash: sha256(token), resetTokenExpires: mongoose.trusted({ $gt: now() }) }).select("+password");
  if (!user) throw new ValidationError("The reset token is invalid or has expired");
  user.password = newPassword;
  user.set({ resetTokenHash: null, resetTokenExpires: null });
  await user.save();
  res.json({ status: "ok" });
};
