// Loaded before every program a job runs (node --import): stdout and stderr
// block when the pipe to the runner is full, the way they would in a
// terminal. Without it, a program that prints in a tight loop never gives the
// event loop a turn, so its writes pile up in memory until V8 runs out of heap,
// instead of reaching the 1 MB output limit.
for (const stream of [process.stdout, process.stderr]) stream._handle?.setBlocking?.(true);
