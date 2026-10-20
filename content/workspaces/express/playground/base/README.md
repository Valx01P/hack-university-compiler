# Express playground

Free play for the Node, Express and databases course. Every package the course uses is already
installed, so any import from the lessons works here, and both databases are ready for you.

## Start

- `npm run dev` runs `src/server.ts` and restarts it on every save. It prints its address
  (`Listening on http://localhost:23017`), which works in the API panel, a new tab, and the
  terminal: `curl -s "localhost:$PORT/hello?name=Ada" | jq`.
- `node src/scratch.ts` runs the scratch file. Node 26 runs TypeScript directly.
- `npm run typecheck` checks the types (`tsc --noEmit`), the same errors as the Problems panel.
- `npm test` runs Vitest on any `*.test.ts` file you add.
- `psql "$DATABASE_URL" -f scratch.sql` makes a small `gigs` table in PostgreSQL 18, and
  `psql "$DATABASE_URL"` opens a prompt.
- `mongosh "$MONGODB_URI" scratch.mongo.js` makes a `gigs` collection in MongoDB 8.0, and
  `mongosh "$MONGODB_URI"` opens a shell.

## What is installed

| Tool | For |
| --- | --- |
| `node` 26.12.0, `npm`, `npx` | running `.ts` files, scripts, and package binaries |
| `tsc` (TypeScript 7.0.2) | type checking |
| `psql` | PostgreSQL from the terminal |
| `mongosh` | MongoDB from the terminal |
| `curl`, `jq` | calling your server and reading JSON |
| `git` | `git status` and `git diff` show what you changed |
| `autocannon` | load tests: `npx autocannon -c 20 -d 5 "localhost:$PORT/hello"` |

The packages, at the versions the course pins: express 5.3.0 (and Express 4.22.3 as `express4`,
for comparing), zod, pg, drizzle-orm with drizzle-kit, mongoose and mongodb, vitest and
supertest, pino, pino-http, and pino-pretty, helmet, cors, express-rate-limit, argon2,
bcryptjs, jose, jsonwebtoken, express-session with connect-pg-simple and connect-mongo,
cookie-parser, multer, ejs, and the matching `@types` packages. `package.json` lists them all.

## Already set for you

| Variable | What it is |
| --- | --- |
| `PORT` | the port to listen on, free on your machine, the same number inside and outside |
| `HOST` | `0.0.0.0`, so the server is reachable from outside the container |
| `DATABASE_URL` | your own PostgreSQL database |
| `MONGODB_URI` | your own MongoDB database |
| `NODE_ENV` | `development` |

Create a `.env` file for anything else: `npm run dev` and `npm start` read it, and the variables
above still win.

## Start over

Reset in the toolbar puts back any file, or all of them, or the databases. Running
`scratch.sql` or `scratch.mongo.js` again also starts that table or collection over. Any other
course codebase opens here in sandbox mode, with its own files and data, from the playground menu.
