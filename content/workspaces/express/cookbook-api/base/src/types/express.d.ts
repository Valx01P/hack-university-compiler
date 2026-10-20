// Declaration merging: the fields this app adds to Express's Request and to the session.
import "express";
import "express-session";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}
