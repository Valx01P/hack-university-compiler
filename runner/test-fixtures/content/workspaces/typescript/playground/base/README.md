# TypeScript playground

A small, real Node 26 TypeScript project for trying things out across several files.
TypeScript 7 checks the code, and Node runs the `.ts` files directly by stripping the
types, so there is no build step. zod is installed, so anything from the single-file
lessons works here too.

## What is here

| Path | What it is |
| --- | --- |
| `src/main.ts` | The program: prints a greeting and a typed summary of `data/sample.json` |
| `src/greet.ts` | `greet(name)`, the function the test checks |
| `test/greet.test.ts` | One `node:test` test to copy from |
| `data/sample.json` | 5 small records (`id`, `name`, `tags`, `active`) for JSON and zod experiments |
| `tsconfig.json` | The course's compiler settings, checking `src` and `test` |
| `package.json` | The scripts below, and the exact versions of zod, TypeScript, and Node's types |

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs `src/main.ts` once (this is what Run does) |
| `npm run dev` | Runs it again every time you save (`node --watch`) |
| `npm run typecheck` | Type-checks everything with `tsc` (the Problems panel runs it after every save too) |
| `npm test` | Runs every `test/**/*.test.ts` file with `node --test` |
| `npm run check` | Type-checks, then tests, and stops at the first failure |
| `node src/main.ts` | What `npm start` runs: any `.ts` file runs this way |

## What happens when you press Run

1. Run starts the `start` task, which is `npm start`, which runs `node src/main.ts`.
2. Node reads `src/main.ts`, replaces every type annotation with spaces, and runs what is
   left as JavaScript. It never checks the types: that is `tsc`'s job, in the Problems panel
   and in `npm run typecheck`.
3. `main.ts` imports `./greet.ts` with its real extension, because Node loads the file you
   name (`tsconfig.json` allows `.ts` in imports for exactly this reason).
4. It reads `data/sample.json`, and `z.array(Sample).parse` turns the parsed JSON, which is
   `any`, into `Sample[]`. If a record does not match the schema, `parse` throws a
   `ZodError` whose `path` names the record's position and the field, such as
   `[2, "active"]`, and the program stops there with exit code 1.
5. It prints three lines:

```text
Hello, TypeScript!
5 records, 3 active: Ada, Grace, Katherine
tags: codes, compilers, engines, kernels, math, navy, orbits
```

## What is installed

Node 26.12.0 with npm 12.2.0, TypeScript 7.0.2 (`tsc`, in this project and globally), tsx
4.23.15 (for code that uses `enum` or other syntax Node cannot strip), and the terminal
tools `jq`, `sqlite3`, `curl`, `git`, `ripgrep` (`rg`), and `tree`. The workspace has no
internet, but `npm install` works for every package the course uses, at the version the
course uses (`npm install -D tsx@4.23.15`), because they are already in the local npm cache.

## Files and resets

Your files live on your Mac in `~/.hack-university/workspaces/`, so they survive reloads
and restarts. The reset menu puts one file, one folder, or everything back the way the
template has it. Resetting everything takes a save point first, so Undo brings your
version back.
