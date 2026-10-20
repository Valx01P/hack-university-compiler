#!/usr/bin/env node
// The sandbox's security suite (PLAN.md 8.6, architecture §11.5). Each test
// proves an invariant against the real thing: containers made from the real
// profiles, jobs run through the real recipes, a real runner process, and
// the real Piston. It gates every phase. P0 built jobs and the runner, so it
// has S1, S2, S4, S9, S14, and S16, and P2's databases add S8. The rest
// arrive with what they test.
//
//   npm run security:verify               # every test
//   npm run security:verify -- S1 S9      # some
//
// Needs Docker and the hu images (npm run images). Everything runs in the
// verify namespace (hv- names, hu.ns=verify), and is removed at the end. The
// runners it starts listen on 127.0.0.1:3311 (HU_VERIFY_PORT), or on any
// free port when something else has it.
import dns from "node:dns/promises";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { capabilityMask, jobProfile, SCRIPT_JOB, standardProfile, sysadminProfile, SYSADMIN_CAPS, WORKSPACE_LIMITS } from "../runner/profiles.ts";
import { WebSocket, execText, freePort, startRunner, verifyKit } from "../runner/verify.ts";
import { pgEnv } from "../runner/db/clients.ts";
import { Databases } from "../runner/db/index.ts";
import { JobPool } from "../runner/jobs.ts";
import { quietLog } from "../runner/log.ts";
import { runRecipe } from "../runner/recipes/index.ts";
import { RunRequest } from "../runner/schemas.ts";

const PREFERRED_PORT = Number(process.env.HU_VERIFY_PORT ?? 3311);
const PORT = await freePort(PREFERRED_PORT);
const PISTON = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");
const wanted = process.argv.slice(2).map((a) => a.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`   ✓ ${name}`);
  else {
    failures++;
    console.log(`   ✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
  return ok;
}
const note = (text) => console.log(`   · ${text}`);

/** What a process inside a sandbox can see about itself. */
const PROBE = [
  'echo "uid=$(id -u)"',
  'grep -E "^(CapEff|NoNewPrivs|Seccomp):" /proc/self/status | tr -d "\\t "',
  "if touch /probe 2>/dev/null; then echo root=writable; else echo root=read-only; fi",
  "if [ -e /var/run/docker.sock ] || [ -e /run/docker.sock ]; then echo socket=present; else echo socket=absent; fi",
].join("\n");

function parseProbe(text) {
  const facts = {};
  for (const line of text.split("\n")) {
    const m = /^([\w-]+)[=:](.*)$/.exec(line.trim());
    if (m) facts[m[1]] = m[2];
  }
  return facts;
}

function hardened(label, facts, { uid, capEff, noNewPrivs }) {
  check(`${label}: runs as uid ${uid}`, facts.uid === String(uid), `uid ${facts.uid}`);
  check(`${label}: CapEff is ${capEff}`, BigInt(`0x${facts.CapEff ?? "f"}`) === BigInt(capEff), `CapEff ${facts.CapEff}`);
  check(`${label}: NoNewPrivs is ${noNewPrivs}`, facts.NoNewPrivs === String(noNewPrivs), `NoNewPrivs ${facts.NoNewPrivs}`);
  check(`${label}: seccomp filters system calls (Seccomp 2)`, facts.Seccomp === "2", `Seccomp ${facts.Seccomp}`);
  check(`${label}: the root file system is read-only`, facts.root === "read-only", facts.root);
  check(`${label}: no Docker socket inside`, facts.socket === "absent", facts.socket);
}

/** Docker's own view of a container: no privilege, no published ports, no socket mount. */
async function inspected(label, container) {
  const info = await container.inspect();
  const host = info.HostConfig;
  check(`${label}: not privileged, every capability dropped first`, host.Privileged === false && host.CapDrop?.includes("ALL"));
  check(`${label}: publishes no port`, !host.PortBindings || Object.keys(host.PortBindings).length === 0);
  const mounts = info.Mounts.map((m) => m.Source ?? "");
  check(`${label}: mounts no Docker socket`, !mounts.some((s) => s.includes("docker.sock")), mounts.join(", "));
  check(`${label}: no host namespaces`, !["host"].includes(host.NetworkMode) && host.PidMode !== "host" && host.IpcMode !== "host");
}

// ---------------------------------------------------------------- S1

async function S1(kit) {
  // Jobs through the real recipes: exactly what a learner's Run gets.
  const bash = await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: PROBE }] });
  hardened("bash job", parseProbe(bash.run.stdout), { uid: 1000, capEff: 0n, noNewPrivs: 1 });
  const node = await kit.run({
    recipe: "typescript",
    files: [
      {
        name: "main.ts",
        content: [
          'import { execFileSync } from "node:child_process";',
          `process.stdout.write(execFileSync("bash", ["-c", ${JSON.stringify(PROBE)}], { encoding: "utf8" }));`,
        ].join("\n"),
      },
    ],
  });
  hardened("typescript job", parseProbe(node.run.stdout), { uid: 1000, capEff: 0n, noNewPrivs: 1 });

  // The job profile as Docker applies it.
  await kit.withContainer(
    jobProfile({
      name: kit.name("s1-job"),
      image: kit.images.tag("bash"),
      labels: kit.labels("job"),
      workDir: "/home/learner",
      hostname: "devbox",
      env: [],
      limits: SCRIPT_JOB,
    }),
    async (c) => {
      await inspected("job profile", c);
      const ulimit = await execText(c, ["bash", "-c", "ulimit -f; ulimit -u; cat /sys/fs/cgroup/pids.max /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/cpu.max"]);
      const [fsize, , pids, memory, swap, cpu] = ulimit.stdout.trim().split("\n");
      check("job profile: 64 MiB file size, 128 processes, 512 MiB, no swap, 1 CPU", fsize === "65536" && pids === "128" && memory === "536870912" && swap === "0" && cpu === "1000000 1000000", ulimit.stdout.trim().replace(/\n/g, " "));
    }
  );

  // The standard workspace profile (P1 uses it), with a real bind mount and home volume.
  const files = mkdtempSync(path.join(tmpdir(), "hv-files-"));
  const home = await kit.docker.createVolume({ Name: kit.name("s1-home"), Labels: kit.labels("workspace") });
  try {
    await kit.withContainer(
      standardProfile({
        name: kit.name("s1-ws"),
        image: kit.images.tag("node"),
        labels: kit.labels("workspace"),
        env: ["HOME=/home/learner"],
        filesDir: files,
        homeVolume: home.name,
        limits: WORKSPACE_LIMITS.typescript,
      }),
      async (c) => {
        await inspected("standard profile", c);
        hardened("standard profile", parseProbe((await execText(c, ["bash", "-c", PROBE])).stdout), { uid: 1000, capEff: 0n, noNewPrivs: 1 });
      }
    );
  } finally {
    rmSync(files, { recursive: true, force: true });
  }

  // The sysadmin profile (Bash workspaces in P1): root, but fenced in.
  const vols = {};
  for (const v of ["files", "srv", "cron"]) vols[v] = (await kit.docker.createVolume({ Name: kit.name(`s1-${v}`), Labels: kit.labels("workspace") })).name;
  await kit.withContainer(
    sysadminProfile({ name: kit.name("s1-sys"), image: kit.images.tag("bash"), labels: kit.labels("workspace"), env: [], volumes: vols }),
    async (c) => {
      await inspected("sysadmin profile", c);
      const info = await c.inspect();
      check("sysadmin profile: no host mounts at all", info.Mounts.every((m) => m.Type === "volume" || m.Type === "tmpfs"));
      hardened("sysadmin profile", parseProbe((await execText(c, ["bash", "-c", PROBE], { user: "0:0" })).stdout), {
        uid: 0,
        capEff: capabilityMask(SYSADMIN_CAPS),
        noNewPrivs: 0,
      });
      const raw = await execText(c, ["bash", "-c", "mknod /tmp/x c 1 3 2>&1; echo $?"], { user: "0:0" });
      check("sysadmin profile: even root can't make device nodes (MKNOD dropped)", raw.stdout.trim().endsWith("1"), raw.stdout.trim());
    }
  );
}

// ---------------------------------------------------------------- S2

/** Bash that tries every way out and prints one verdict per line. */
function egressProbe(targets) {
  const lines = ['if getent hosts registry.npmjs.org >/dev/null 2>&1; then echo "dns=reached"; else echo "dns=blocked"; fi'];
  lines.push('if getent hosts host.docker.internal >/dev/null 2>&1; then echo "host-name=reached"; else echo "host-name=blocked"; fi');
  for (const [name, ip, port] of targets) {
    lines.push(`if timeout 3 bash -c 'exec 3<>/dev/tcp/${ip}/${port}' 2>/dev/null; then echo "${name}=reached"; else echo "${name}=blocked"; fi`);
  }
  return lines.join("\n");
}

async function S2(kit) {
  // Where "out" is, looked up from places that can see it.
  const registry = (await dns.lookup("registry.npmjs.org", { family: 4 })).address;
  const bridge = await kit.withContainer(
    {
      name: kit.name("s2-control"),
      Image: kit.images.tag("bash"),
      Cmd: ["/opt/hu/bin/hu-exec", "--idle"],
      User: "1000:1000",
      Labels: kit.labels("job"),
      HostConfig: { Init: true, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"], ReadonlyRootfs: true },
    },
    async (c) => {
      const out = await execText(c, ["getent", "ahostsv4", "host.docker.internal", "gateway.docker.internal"]);
      const ips = [...new Set(out.stdout.split("\n").map((l) => l.split(/\s+/)[0]).filter(Boolean))];
      const piston = await execText(c, ["bash", "-c", `timeout 3 bash -c 'exec 3<>/dev/tcp/host.docker.internal/2000' && echo reached`]);
      return { host: ips[0], gateway: ips[1] ?? ips[0], pistonReached: piston.stdout.includes("reached") };
    }
  );
  note(`registry.npmjs.org is ${registry}, host.docker.internal ${bridge.host}, gateway.docker.internal ${bridge.gateway}`);
  if (bridge.pistonReached) note("control: a container on Docker's ordinary network does reach Piston, so these probes can tell");
  const targets = [
    ["registry", registry, 443],
    ["host-2000", bridge.host, 2000],
    ["host-3000", bridge.host, 3000],
    ["host-3100", bridge.host, 3100],
    ["gateway", bridge.gateway, 80],
    ["gateway-2000", bridge.gateway, 2000],
  ];
  const script = egressProbe(targets);
  const verdicts = (label, stdout) => {
    const v = parseProbe(stdout);
    for (const key of ["dns", "host-name", ...targets.map((t) => t[0])]) check(`${label}: ${key} unreachable`, v[key] === "blocked", v[key] ?? "no answer");
  };

  verdicts("bash job", (await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: script }] })).run.stdout);
  const nodeJob = await kit.run({
    recipe: "typescript",
    files: [
      {
        name: "main.ts",
        content: [
          'import { connect } from "node:net";',
          `const targets: [string, number][] = ${JSON.stringify(targets.map((t) => [t[1], t[2]]))};`,
          "for (const [host, port] of targets) {",
          "  const ok = await new Promise<boolean>((resolve) => {",
          "    const s = connect({ host, port, timeout: 3000 }, () => { s.destroy(); resolve(true); });",
          "    s.on(\"error\", () => resolve(false));",
          "    s.on(\"timeout\", () => { s.destroy(); resolve(false); });",
          "  });",
          "  console.log(`${host}:${port}=${ok ? \"reached\" : \"blocked\"}`);",
          "}",
        ].join("\n"),
      },
    ],
  });
  check("typescript job: every target unreachable from node:net", nodeJob.run.stdout.trim().split("\n").every((l) => l.endsWith("=blocked")), nodeJob.run.stdout.trim().replace(/\n/g, " "));

  // A run with a database: its job is on the real database network, with servers of its own.
  const dbData = mkdtempSync(path.join(tmpdir(), "hv-s2-db-"));
  const databases = new Databases({ docker: kit.docker, owner: { ns: "verify", boot: kit.owner.boot, port: await freePort(PORT + 2) }, dataDir: dbData, log: quietLog, env: {} });
  try {
    const deps = { docker: kit.docker, owner: kit.owner, images: kit.images, pool: new JobPool(1), log: quietLog, databases };
    const dbRun = await runRecipe(
      deps,
      RunRequest.parse({
        recipe: "typescript",
        setup: "CREATE TABLE t (a int);",
        files: [
          {
            name: "main.ts",
            content: [
              'import { connect } from "node:net";',
              `const targets: [string, number][] = ${JSON.stringify([...targets.map((t) => [t[1], t[2]]), ["db", 5432]])};`,
              "for (const [host, port] of targets) {",
              "  const ok = await new Promise<boolean>((resolve) => {",
              "    const s = connect({ host, port, timeout: 3000 }, () => { s.destroy(); resolve(true); });",
              "    s.on(\"error\", () => resolve(false));",
              "    s.on(\"timeout\", () => { s.destroy(); resolve(false); });",
              "  });",
              "  console.log(`${host}:${port}=${ok ? \"reached\" : \"blocked\"}`);",
              "}",
            ].join("\n"),
          },
        ],
      })
    );
    const lines = dbRun.run.stdout.trim().split("\n");
    check("run with a database (the database network): every target unreachable", lines.filter((l) => !l.startsWith("db:")).every((l) => l.endsWith("=blocked")), lines.join(" "));
    check("…while its own database answers on db:5432", lines.includes("db:5432=reached"), lines.join(" "));
  } finally {
    await databases.shutdown();
    rmSync(dbData, { recursive: true, force: true });
  }

  // A workspace on no network, and one on an internal network (what hu-db is).
  const files = mkdtempSync(path.join(tmpdir(), "hv-files-"));
  const network = await kit.docker.createNetwork({ Name: kit.name("s2-db"), Internal: true, Labels: kit.labels("db") });
  try {
    for (const net of ["none", network.id]) {
      const label = net === "none" ? "workspace on no network" : "workspace on an internal network";
      const home = await kit.docker.createVolume({ Name: kit.name("s2-home"), Labels: kit.labels("workspace") });
      const options = standardProfile({
        name: kit.name("s2-ws"),
        image: kit.images.tag("node"),
        labels: kit.labels("workspace"),
        env: [],
        filesDir: files,
        homeVolume: home.name,
        limits: WORKSPACE_LIMITS.typescript,
      });
      options.HostConfig.NetworkMode = net;
      await kit.withContainer(options, async (c) => verdicts(label, (await execText(c, ["bash", "-c", script])).stdout));
    }
  } finally {
    rmSync(files, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- S4

async function S4(kit) {
  // The shell lives on for a few seconds while the bomb goes off around it.
  const bombed = Date.now();
  const bomb = await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: "bomb() { bomb | bomb & }\nbomb\nsleep 3\n" }] });
  check("a fork bomb hits the process limit and is stopped", bomb.run.limit === "pids" && Date.now() - bombed < 15_000, `${bomb.run.status}, limit ${bomb.run.limit}, ${Date.now() - bombed} ms`);

  const hog = await kit.run({ recipe: "typescript", files: [{ name: "main.ts", content: "const keep: Buffer[] = [];\nfor (;;) keep.push(Buffer.alloc(16 << 20, 1));\n" }] });
  check("a memory hog is killed at 512 MB and reported as the memory limit", hog.run.signal === "SIGKILL" && hog.run.limit === "memory", `${hog.run.signal}, limit ${hog.run.limit}`);

  const yes = await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: 'yes > f\necho "yes exited with $?"\nstat -c %s f\n' }] });
  const size = Number(yes.run.stdout.trim().split("\n").at(-1));
  check("yes > f in a job stops at 64 MiB (the file size limit and the tmpfs are both 64 MiB)", size > 0 && size <= 64 * 1024 * 1024 && yes.run.status !== "TO", `${size} bytes, ${yes.run.stdout.split("\n")[0]}`);

  const files = mkdtempSync(path.join(tmpdir(), "hv-files-"));
  const home = await kit.docker.createVolume({ Name: kit.name("s4-home"), Labels: kit.labels("workspace") });
  try {
    await kit.withContainer(
      standardProfile({
        name: kit.name("s4-ws"),
        image: kit.images.tag("node"),
        labels: kit.labels("workspace"),
        env: [],
        filesDir: files,
        homeVolume: home.name,
        limits: WORKSPACE_LIMITS.typescript,
      }),
      async (c) => {
        const out = await execText(c, ["bash", "-c", "yes > /workspace/f; echo $?"], { timeoutMs: 120_000 });
        const written = statSync(path.join(files, "f")).size;
        check("yes > f in a workspace stops at exactly its 512 MiB file size limit (SIGXFSZ)", out.stdout.trim() === "153" && written === 512 * 1024 * 1024, `exit ${out.stdout.trim()}, ${written} bytes`);
      }
    );
  } finally {
    rmSync(files, { recursive: true, force: true });
  }

  const started = Date.now();
  const flood = await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: "yes\n" }] });
  check("a flood of output stops at once, at 1 MB", flood.run.status === "OL" && Date.now() - started < 3000, `${flood.run.status} after ${Date.now() - started} ms`);
  note("Ctrl+C in a terminal during yes waits for P1's terminals. Its job counterpart is the flood above");

  const after = await kit.run({ recipe: "bash", files: [{ name: "main.sh", content: "echo fine\n" }] });
  check("the sandbox recovers: the next job runs normally", after.run.stdout === "fine\n" && after.run.code === 0);
}

// ---------------------------------------------------------------- S9

function socket(port, { origin = "http://localhost:3000", host, path: p = "/v1/ws/events" } = {}) {
  return new Promise((resolve) => {
    const headers = { origin };
    if (host) headers.host = host;
    const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`, { headers });
    ws.once("open", () => resolve({ ws }));
    ws.once("unexpected-response", (_req, res) => resolve({ ws, refused: res.statusCode }));
    ws.once("error", () => resolve({ ws, refused: -1 }));
  });
}

function hello(ws, ticket) {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve({ message: JSON.parse(String(data)) }));
    ws.once("close", (code) => resolve({ code }));
    if (ticket !== undefined) ws.send(JSON.stringify({ t: "hello", ticket }));
  });
}

async function S9() {
  const runner = startRunner(PORT, { HU_TICKET_TTL_MS: "400", HU_WS_HELLO_MS: "500" });
  try {
    await runner.ready();
    check("no token gives 401", (await runner.request("GET", "/v1/health", { token: null })).status === 401);
    check("a wrong token gives 401", (await runner.request("GET", "/v1/health", { token: "not-the-token" })).status === 401);
    check("an Origin header gives 403", (await runner.request("GET", "/v1/health", { headers: { origin: "http://localhost:3000" } })).status === 403);
    check("a foreign Host gives 403 (DNS rebinding)", (await runner.request("GET", "/v1/health", { headers: { host: `evil.example:${PORT}` } })).status === 403);
    const preflight = await runner.request("OPTIONS", "/v1/run", { token: null, headers: { origin: "http://localhost:23017", "access-control-request-method": "POST" } });
    check("a preflight gets 403 and no CORS headers", preflight.status === 403 && !Object.keys(preflight.headers).some((h) => h.startsWith("access-control")));
    check("the token and the right Host get in", (await runner.request("GET", "/v1/health")).status === 200);

    check("a WebSocket from a foreign Origin is refused", (await socket(PORT, { origin: "http://evil.example" })).refused === 403);
    check("a WebSocket from a preview's Origin is refused", (await socket(PORT, { origin: "http://localhost:23017" })).refused === 403);
    check("a WebSocket with a foreign Host is refused", (await socket(PORT, { host: `evil.example:${PORT}` })).refused === 403);

    const issue = async (body) => (await runner.request("POST", "/v1/tickets", { body })).json.ticket;
    const events = { workspace: "wk3j6q2m7xa", kind: "events" };
    const good = await issue(events);
    const first = await socket(PORT);
    check("a fresh ticket opens the events socket", (await hello(first.ws, good)).message?.t === "ready");
    first.ws.close();
    const reused = await socket(PORT);
    check("a reused ticket is refused (4401)", (await hello(reused.ws, good)).code === 4401);
    const stale = await issue(events);
    await sleep(500);
    const late = await socket(PORT);
    check("an expired ticket is refused (4401)", (await hello(late.ws, stale)).code === 4401);
    const silent = await socket(PORT);
    check("a socket that sends no ticket is closed (4401)", (await hello(silent.ws)).code === 4401);
    const term = await socket(PORT, { path: "/v1/ws/term/s1abcdef" });
    check("an events ticket on a terminal socket is refused (4403)", (await hello(term.ws, await issue(events))).code === 4403);
    const other = await socket(PORT, { path: "/v1/ws/term/s2abcdef" });
    check("a ticket for another terminal is refused (4403)", (await hello(other.ws, await issue({ workspace: "wk3j6q2m7xa", kind: "term", sid: "s1abcdef" }))).code === 4403);
  } finally {
    await runner.stop();
    rmSync(runner.dataDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- S14

async function jobsOnPort(kit) {
  return kit.docker.listContainers({ all: true, filters: { label: ["hu.managed=1", "hu.ns=verify", "hu.kind=job", `hu.port=${PORT}`] } });
}

async function S14(kit) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "hv-runner-"));
  let runner = startRunner(PORT, {}, dataDir);
  try {
    await runner.ready();
    // A Run and a Check, each stuck in a long step when the runner dies.
    const run = runner.request("POST", "/v1/run", { body: { recipe: "bash", files: [{ name: "main.sh", content: "sleep 60\n" }] } }).catch(() => null);
    const checkRun = runner
      .request("POST", "/v1/run", { body: { recipe: "typescript", files: [{ name: "main.ts", content: "await new Promise((r) => setTimeout(r, 60_000));\n" }], tests: [{}, {}] } })
      .catch(() => null);
    let jobs = [];
    for (let i = 0; i < 100 && jobs.length < 2; i++) {
      await sleep(100);
      jobs = (await jobsOnPort(kit)).filter((c) => c.State === "running");
    }
    check("a run and a check are under way", jobs.length === 2, `${jobs.length} running`);
    for (const job of jobs) {
      const mounts = (await kit.docker.getContainer(job.Id).inspect()).Mounts;
      check(`${job.Names[0].slice(1, 20)}...: a job keeps everything on tmpfs, no volume`, mounts.length === 0, mounts.map((m) => m.Type).join(", "));
    }
    await runner.stop("SIGKILL");
    await Promise.all([run, checkRun]);
    check("kill -9 of the runner leaves its jobs behind", (await jobsOnPort(kit)).length === 2);

    runner = startRunner(PORT, {}, dataDir);
    await runner.ready();
    let left = await jobsOnPort(kit);
    for (let i = 0; i < 50 && left.length; i++) {
      await sleep(100);
      left = await jobsOnPort(kit);
    }
    check("a restarted runner removes every job left behind", left.length === 0, left.map((c) => c.Names[0]).join(", "));
    const volumes = (await kit.docker.listVolumes({ filters: { label: ["hu.managed=1", "hu.ns=verify", `hu.port=${PORT}`] } })).Volumes ?? [];
    check("and no volume is left behind", volumes.length === 0);

    // npm run runner beside npm run up: a second runner on the same port
    // can't have it, and must leave the first one's jobs alone.
    const inflight = runner.request("POST", "/v1/run", { body: { recipe: "bash", files: [{ name: "main.sh", content: "sleep 2\necho finished\n" }] } });
    for (let i = 0; i < 100 && !(await jobsOnPort(kit)).some((c) => c.State === "running"); i++) await sleep(50);
    const second = startRunner(PORT);
    const exit = await Promise.race([new Promise((resolve) => second.child.once("exit", resolve)), sleep(15_000).then(() => "still running")]);
    await second.stop();
    rmSync(second.dataDir, { recursive: true, force: true });
    const answer = await inflight;
    check(
      "a second runner on the same port exits without touching the first one's run",
      exit === 1 && answer.status === 200 && answer.json?.run?.stdout === "finished\n",
      `exit ${exit}, ${answer.status} ${JSON.stringify(answer.json?.run ?? answer.json)}`
    );
    note("a workspace start (P1) and ck_ and run_ databases (P2) join this test when they exist");
  } finally {
    await runner.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- S16

async function S16() {
  try {
    await fetch(`${PISTON}/runtimes`, { signal: AbortSignal.timeout(3000) });
  } catch {
    note("Piston isn't running here (npm run piston:up), so there's nothing to test");
    return;
  }
  const preflight = await fetch(`${PISTON}/execute`, {
    method: "OPTIONS",
    headers: { origin: "http://localhost:23017", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  const grant = preflight.headers.get("access-control-allow-origin");
  check("a preflight from a preview's origin gets no CORS grant", !grant, `Access-Control-Allow-Origin: ${grant}`);
  const plain = await fetch(`${PISTON}/execute`, {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "http://localhost:23017" },
    body: JSON.stringify({ language: "python", version: "*", files: [{ content: "print(1)" }] }),
  });
  check("a text/plain execute request gets 415, so a page can't run code with a simple request", plain.status === 415, `status ${plain.status}`);
}

// ---------------------------------------------------------------- S8

/** Every statement the runner may send into hu-postgres: its fixed templates, filled with names and passwords, and its own catalog reads. */
function allowedSql() {
  const dir = path.join(import.meta.dirname, "..", "runner", "db", "sql");
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = (text) =>
    new RegExp(`^${escape(text).replace(/\\\{\\\{password\\\}\\\}/g, "[0-9a-f]{32}").replace(/\\\{\\\{\w+\\\}\\\}/g, "[a-z0-9_]+")}$`);
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => pattern(readFileSync(path.join(dir, f), "utf8")));
  return [
    ...sql,
    /^SELECT datname, datistemplate FROM pg_database;$/,
    /^SELECT rolname FROM pg_roles;$/,
    /^SELECT datname, pg_database_size\(datname\) FROM pg_database WHERE datname IN \('[a-z0-9_]+'(, '[a-z0-9_]+')*\);$/,
  ];
}

async function S8(kit) {
  // Servers of its own, named after a port no runner uses, in a data folder of its own.
  const owner = { ns: "verify", boot: kit.owner.boot, port: await freePort(PORT + 1) };
  const dataDir = mkdtempSync(path.join(tmpdir(), "hv-s8-"));
  const db = new Databases({ docker: kit.docker, owner, dataDir, log: quietLog, env: {} });
  // A trace of every docker exec into hu-postgres and every statement sent to it.
  const execs = [];
  const sent = [];
  const pg = db.services.pg;
  const container = pg.container;
  const exec = container.exec.bind(container);
  container.exec = (options) => (execs.push(options.Cmd), exec(options));
  for (const method of ["run", "script"]) {
    const original = pg[method].bind(pg);
    pg[method] = (sql, ...rest) => (sent.push(sql), original(sql, ...rest));
  }
  try {
    const spec = {
      postgres: { sql: [{ name: "db/schema.sql", text: "CREATE TABLE notes (id int);\nINSERT INTO notes VALUES (1);" }] },
      mongo: { documents: JSON.stringify({ notes: [{ n: 1 }] }) },
    };
    const env = (await db.attach("wsecurityaa", { course: "security", template: "s8" }, spec)).env;
    await db.attach("wsecuritybb", { course: "security", template: "s8" }, spec);
    const url = new URL(env.find((e) => e.startsWith("DATABASE_URL=")).slice("DATABASE_URL=".length));
    const conn = { role: url.username, password: url.password, database: url.pathname.slice(1) };
    const asLearner = async (sql, database = conn.database) => {
      const r = await db.clients.run("ws:wsecurityaa", ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], { env: pgEnv({ ...conn, database }), stdin: sql, timeoutMs: 20_000 });
      return r.stderr.toString();
    };
    const refused = [
      ["run COPY … TO PROGRAM", "COPY (SELECT 1) TO PROGRAM 'id';", /permission denied to COPY to or from an external program/],
      ["create the dblink extension", "CREATE EXTENSION dblink;", /permission denied to create extension "dblink"/],
      ["call pg_read_file", "SELECT pg_read_file('/etc/passwd');", /permission denied for function pg_read_file/],
      ["use ALTER SYSTEM", "ALTER SYSTEM SET work_mem = '1GB';", /permission denied to set parameter/],
      ["raise temp_file_limit", "SET temp_file_limit = '10GB';", /permission denied to set parameter "temp_file_limit"/],
      ["write a function in an untrusted language", "CREATE FUNCTION f() RETURNS int LANGUAGE c AS '/lib/x', 'f';", /permission denied for language c/],
    ];
    for (const [what, sql, expected] of refused) {
      const err = await asLearner(sql);
      check(`a learner role can't ${what}`, expected.test(err), err.trim().split("\n")[0]);
    }
    const other = await asLearner("SELECT 1;", "ws_wsecuritybb");
    check("a learner role can't log in to another workspace's database", /permission denied for database "ws_wsecuritybb"/.test(other), other.trim());
    const maintenance = await asLearner("SELECT 1;", "postgres");
    check("…or to the postgres database", /permission denied for database "postgres"/.test(maintenance), maintenance.trim());
    const where = await db.query("wsecurityaa", { collection: "notes", filter: { $where: "true" } });
    check("Mongo $where fails (no server-side JavaScript)", Boolean(where.error), JSON.stringify(where.error));
    const own = await db.query("wsecurityaa", { collection: "notes", filter: { n: 1 } });
    check("…while an ordinary filter works", own.rows?.length === 1, JSON.stringify(own));

    // Exactly what reached hu-postgres.
    const commands = execs.map((c) => c.join(" "));
    check(
      "every docker exec into hu-postgres is the runner's own psql or pg_isready",
      commands.length > 0 && commands.every((c) => c.startsWith("psql -U postgres -d ") || c.startsWith("pg_isready ")),
      commands.filter((c) => !c.startsWith("psql -U postgres -d ") && !c.startsWith("pg_isready ")).join("; ")
    );
    const allowed = allowedSql();
    const foreign = sent.filter((sql) => !allowed.some((re) => re.test(sql)));
    check(`every statement sent into hu-postgres is template SQL (${sent.length} sent)`, foreign.length === 0, foreign.slice(0, 3).join(" | "));
    const statementsSent = sent.map((sql) => sql.replace(/^--.*$/gm, ""));
    check("no learner or template text ever reached it", !statementsSent.some((sql) => /CREATE TABLE notes|INSERT INTO notes|dblink|pg_read_file|TO PROGRAM/.test(sql)));
  } finally {
    await db.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- run

const TESTS = [
  ["S1", "Hardening", S1],
  ["S2", "Egress", S2],
  ["S4", "Limits", S4],
  ["S8", "Databases", S8],
  ["S9", "Runner auth", S9],
  ["S14", "Cleanup", S14],
  ["S16", "Piston", S16],
];

let kit;
try {
  kit = await verifyKit();
} catch {
  console.error("✗ Docker isn't running. Start Docker Desktop, then run npm run security:verify again.");
  process.exit(1);
}
for (const name of ["node", "bash"]) {
  if (kit.images.state(name) !== "ready") {
    console.error(`✗ ${kit.images.tag(name)} isn't built. Run npm run images first.`);
    process.exit(1);
  }
}

if (PORT !== PREFERRED_PORT) console.log(`(port ${PREFERRED_PORT} is in use, so the test runners listen on ${PORT})`);
const started = Date.now();
try {
  for (const [id, title, test] of TESTS) {
    if (wanted.length && !wanted.includes(id)) continue;
    console.log(`\n${id} ${title}`);
    const before = failures;
    const t0 = Date.now();
    try {
      await test(kit);
    } catch (err) {
      check(`${id} ran to the end`, false, err?.stack ?? String(err));
    }
    console.log(`   ${failures === before ? "passed" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
} finally {
  await kit.cleanup();
}
console.log(`\n${failures ? `✗ ${failures} check${failures === 1 ? "" : "s"} failed` : "✓ every check passed"} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exitCode = failures ? 1 : 0;
