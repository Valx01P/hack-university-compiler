// Guards routes that need a signed-in user. The session holds only the user id; this loads the
// user and puts it on res.locals for the controller. No session, or a session pointing at a
// user who no longer exists, is 401.
import type { RequestHandler } from "express";
import { UnauthorizedError } from "../errors.ts";
import { UserModel } from "../models/user.model.ts";

// Express 5 forwards a rejected async handler to the error handler, so no try/catch is needed.
export const requireUser: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) throw new UnauthorizedError();
  const user = await UserModel.findById(userId);
  if (!user) throw new UnauthorizedError();
  res.locals.user = user;
  next();
};
