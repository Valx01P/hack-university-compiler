import type Docker from "dockerode";
import { isDockerDown, type Owner } from "../docker.ts";
import type { ImageName, Images } from "../images.ts";
import { Job, JobError, type JobPool } from "../jobs.ts";
import type { Log } from "../log.ts";
import { SCRIPT_JOB } from "../profiles.ts";
import type { RunRequest } from "../schemas.ts";
import * as bash from "./bash.ts";
import type { RunResponse, Timing } from "./types.ts";
import * as typescript from "./typescript.ts";

/**
 * Runs a POST /v1/run request as one job. Content and the browser name a
 * recipe, never a command line: the recipe decides the image, the files, the
 * steps, and the limits.
 */

export interface RecipeDeps {
  docker: Docker;
  owner: Owner;
  images: Images;
  pool: JobPool;
  log: Log;
}

const RECIPES = {
  typescript: { image: typescript.IMAGE, workDir: typescript.WORK_DIR, hostname: typescript.HOSTNAME, env: typescript.baseEnv },
  bash: { image: bash.IMAGE, workDir: bash.HOME, hostname: bash.HOSTNAME, env: bash.baseEnv },
} as const;

export function recipeImage(recipe: RunRequest["recipe"]): ImageName {
  return RECIPES[recipe].image;
}

/** The whole job's deadline: every step's own deadline, plus room to load and collect. */
export function jobDeadlineMs(req: RunRequest): number {
  const limits = SCRIPT_JOB;
  const runs = req.tests?.length ?? 1;
  return (req.recipe === "typescript" ? limits.compileMs : 0) + runs * (limits.runMs + 5_000) + 15_000;
}

export async function runRecipe(deps: RecipeDeps, req: RunRequest, signal?: AbortSignal): Promise<RunResponse> {
  const received = Date.now();
  const recipe = RECIPES[req.recipe];
  const timing: Timing = { queueMs: 0, startMs: 0, loadMs: 0, compileMs: 0, runMs: 0, totalMs: 0 };
  const time = (key: "loadMs" | "compileMs" | "runMs", ms: number) => {
    timing[key] = ms;
  };

  // The answer goes out as soon as the steps are done. The container is
  // removed after that, still holding its slot, so at most `slots`
  // containers ever exist at once.
  let answer!: (value: Omit<RunResponse, "timing">) => void;
  let fail!: (err: unknown) => void;
  const answered = new Promise<Omit<RunResponse, "timing">>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });

  const work = deps.pool.run(async () => {
    timing.queueMs = Date.now() - received;
    let job: Job | null = null;
    const abort = () => void job?.kill("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    try {
      job = await Job.start(
        deps.docker,
        deps.owner,
        {
          image: deps.images.tag(recipe.image),
          recipe: req.recipe,
          workDir: recipe.workDir,
          hostname: recipe.hostname,
          env: recipe.env(),
          limits: SCRIPT_JOB,
          deadlineMs: jobDeadlineMs(req),
        },
        deps.log
      );
      timing.startMs = job.startMs;
      answer(req.recipe === "typescript" ? await typescript.runTypeScript(job, req, time) : await bash.runBash(job, req, time));
    } catch (err) {
      fail(err);
    } finally {
      signal?.removeEventListener("abort", abort);
      await job?.dispose();
    }
  }, signal);
  work.catch(fail);

  try {
    const response = await answered;
    timing.totalMs = Date.now() - received;
    deps.log.info("run.done", { recipe: req.recipe, tests: req.tests?.length ?? 0, ms: timing.totalMs, queue: timing.queueMs });
    return { ...response, timing };
  } catch (err) {
    if (err instanceof JobError) throw err;
    if (isDockerDown(err)) throw new JobError("docker_unavailable", "Docker stopped during the run.");
    deps.log.error("run.failed", { recipe: req.recipe, error: (err as Error).message });
    throw new JobError("job_failed", `The sandbox hit an unexpected error: ${(err as Error).message}`);
  }
}
