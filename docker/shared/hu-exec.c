/*
 * hu-exec: the process every step of a Hack University job runs through.
 *
 *   hu-exec --idle               the job container's main process: waits for good
 *   hu-exec --kill               kills every process but PID 1 and hu-exec itself
 *   hu-exec [-t MS] -- CMD...    runs CMD, stops it after MS milliseconds, kills
 *                                whatever it left running, then appends one
 *                                status line to stderr
 *
 * Docker reports a process killed by signal N as exit status 128 + N, so a
 * script that runs `exit 130` and one stopped by Ctrl+C look the same from the
 * outside. The status line says which it was, and whether the step hit the
 * time, memory, or process limit:
 *
 *   \0hu-exec code=130 signal=0 timeout=0 oom=0 pids=0 ms=12\n
 *
 * code is -1 when the step died on a signal. Learner code runs as the same
 * user, so it could print a status line of its own. The runner reads only the
 * last one, which hu-exec writes after the step and everything it started are
 * gone, so the exec's output closes as soon as the step ends.
 *
 * Built static in each image's Dockerfile, so it needs nothing at run time.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static long now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

/* One counter ("oom_kill 3") from a cgroup v2 events file, or 0. */
static long cgroup_counter(const char *file, const char *key) {
  FILE *f = fopen(file, "r");
  if (!f) return 0;
  char name[64];
  long value, found = 0;
  while (fscanf(f, "%63s %ld", name, &value) == 2) {
    if (strcmp(name, key) == 0) {
      found = value;
      break;
    }
  }
  fclose(f);
  return found;
}

/* The command name of a process, or "" when it is gone. */
static void comm_of(long pid, char *out, size_t size) {
  char path[64];
  snprintf(path, sizeof path, "/proc/%ld/comm", pid);
  out[0] = 0;
  FILE *f = fopen(path, "r");
  if (!f) return;
  if (fgets(out, (int)size, f)) out[strcspn(out, "\n")] = 0;
  fclose(f);
}

/* Signals (or just counts, when sig is 0) every process except PID 1, this
   one, and other hu-exec processes: the idle main process, and a step's own
   hu-exec while --kill stops its command. */
static int others(int sig) {
  int n = 0;
  pid_t self = getpid();
  DIR *d = opendir("/proc");
  if (!d) return 0;
  struct dirent *e;
  while ((e = readdir(d))) {
    char *end;
    long pid = strtol(e->d_name, &end, 10);
    if (*end || pid <= 1 || pid == self) continue;
    char comm[32];
    comm_of(pid, comm, sizeof comm);
    if (!comm[0] || strcmp(comm, "hu-exec") == 0) continue;
    /* A zombie is already dead, it only waits for its parent to reap it. */
    char path[64], state = 0;
    snprintf(path, sizeof path, "/proc/%ld/stat", pid);
    FILE *f = fopen(path, "r");
    if (f) {
      if (fscanf(f, "%*d (%*[^)]) %c", &state) != 1) state = 0;
      fclose(f);
    }
    if (state == 'Z') continue;
    if (sig == 0 || kill((pid_t)pid, sig) == 0) n++;
  }
  closedir(d);
  return n;
}

/* Kills everything the step left behind and waits (at most a second) until it
   is gone, reaping the orphans this subreaper inherited. */
static void kill_and_wait(void) {
  long until = now_ms() + 1000;
  while (others(SIGKILL) > 0 && now_ms() < until) {
    while (waitpid(-1, NULL, WNOHANG) > 0) {
    }
    struct timespec ts = {0, 2 * 1000000L};
    nanosleep(&ts, NULL);
  }
  while (waitpid(-1, NULL, WNOHANG) > 0) {
  }
}

static int usage(void) {
  fputs("usage: hu-exec --idle | --kill | [-t MS] -- CMD [ARG...]\n", stderr);
  return 125;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--idle") == 0) {
    for (;;) pause();
  }
  if (argc == 2 && strcmp(argv[1], "--kill") == 0) {
    kill_and_wait();
    return 0;
  }

  long timeout_ms = 0;
  int i = 1;
  while (i < argc && strcmp(argv[i], "--") != 0) {
    if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
      timeout_ms = atol(argv[i + 1]);
      i += 2;
    } else {
      return usage();
    }
  }
  if (i + 1 >= argc) return usage();
  char **cmd = argv + i + 1;

  /* Orphans of the step (background jobs, nohup) come to us, not to tini, so
     we can wait for them to be gone before reporting. */
  prctl(PR_SET_CHILD_SUBREAPER, 1);
  sigset_t chld;
  sigemptyset(&chld);
  sigaddset(&chld, SIGCHLD);
  sigprocmask(SIG_BLOCK, &chld, NULL);

  long oom_before = cgroup_counter("/sys/fs/cgroup/memory.events", "oom_kill");
  long pids_before = cgroup_counter("/sys/fs/cgroup/pids.events", "max");
  long start = now_ms();

  pid_t child = fork();
  if (child < 0) {
    fprintf(stderr, "hu-exec: fork: %s\n", strerror(errno));
    fprintf(stderr, "%chu-exec code=126 signal=0 timeout=0 oom=0 pids=1 ms=0\n", 0);
    return 126;
  }
  if (child == 0) {
    sigprocmask(SIG_UNBLOCK, &chld, NULL);
    /* Its own process group, so a timeout stops the whole pipeline at once. */
    setpgid(0, 0);
    execvp(cmd[0], cmd);
    int err = errno;
    fprintf(stderr, "hu-exec: %s: %s\n", cmd[0], strerror(err));
    _exit(err == ENOENT ? 127 : 126);
  }
  setpgid(child, child);

  int status = 0, timed_out = 0;
  for (;;) {
    pid_t r = waitpid(child, &status, WNOHANG);
    if (r == child) break;
    if (r < 0 && errno != EINTR) break;
    long left = 1000;
    if (timeout_ms > 0) {
      left = timeout_ms - (now_ms() - start);
      if (left <= 0) {
        timed_out = 1;
        kill(-child, SIGKILL);
        kill(child, SIGKILL);
        waitpid(child, &status, 0);
        break;
      }
    }
    struct timespec ts = {left / 1000, (left % 1000) * 1000000L};
    sigtimedwait(&chld, NULL, &ts);
  }
  long ms = now_ms() - start;

  kill(-child, SIGKILL);
  kill_and_wait();

  long oom = cgroup_counter("/sys/fs/cgroup/memory.events", "oom_kill") - oom_before;
  long pids = cgroup_counter("/sys/fs/cgroup/pids.events", "max") - pids_before;
  int code = -1, sig = 0;
  if (WIFEXITED(status)) code = WEXITSTATUS(status);
  else if (WIFSIGNALED(status)) sig = WTERMSIG(status);
  fprintf(stderr, "%chu-exec code=%d signal=%d timeout=%d oom=%ld pids=%ld ms=%ld\n", 0, code, sig,
          timed_out, oom, pids, ms);
  fflush(stderr);
  return code >= 0 ? code : 128 + sig;
}
