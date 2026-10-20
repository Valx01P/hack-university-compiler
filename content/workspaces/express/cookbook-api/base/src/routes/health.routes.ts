// Liveness and readiness. /health answers while the process is up; /ready also checks that the
// database connection is open, so a load balancer waits for Mongo before sending traffic.
import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/ready", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ status: connected ? "ready" : "not-ready" });
});
