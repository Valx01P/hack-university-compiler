#!/usr/bin/env node
// Runs the in-memory fake runner (fake-runner.mjs) on its own, to work on the
// playground in a browser without the runner:
//
//   node tests/ide/run-fake-runner.mjs --port 3413 --app-port 3410 --token dev
//
// then start the app with HU_RUNNER_PORT=3413 HU_RUNNER_TOKEN=dev PORT=3410.
import { startFakeRunner } from "./fake-runner.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const fake = await startFakeRunner({
  port: Number(arg("port", "3413")),
  appPort: Number(arg("app-port", "3410")),
  token: arg("token", "dev"),
});
console.log(`fake runner on http://127.0.0.1:${fake.port}`);
const stop = async () => {
  await fake.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
