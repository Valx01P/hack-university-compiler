# Hack University Compiler

> The Hack University online compiler, running entirely on your own machine.

Write, compile, and run code in **19 languages** right in the browser. Code runs
in a local [Piston](https://github.com/engineer-man/piston) sandbox in Docker,
so nothing leaves localhost and there is no server to pay for. Same editor, same
themes, same look as the original hackuniversity.dev compiler.

## Requirements

- **Node.js 20.9+**
- **Docker Desktop** (or any Docker engine that can run privileged containers)
- About **13 GB** of disk for every language, much less if you only install a few

On Apple Silicon, turn on **Settings → General → "Use Rosetta for x86_64/amd64
emulation on Apple Silicon"** in Docker Desktop. The sandbox runtimes are x86_64,
and Rosetta makes them run close to native speed.

## Quick start

```bash
git clone https://github.com/Valx01P/hack-university-compiler.git
cd hack-university-compiler
npm install
npm run setup   # starts the sandbox and installs every language (one time, ~10 min)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage redirects to
the Python compiler, and every other language is its own route:
`/javascript`, `/cpp`, `/java`, `/rust`, `/sql`, and so on.

Only need a few languages? Install just those instead of running `setup`:

```bash
npm run piston:up
npm run piston:install -- python javascript cpp
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on `127.0.0.1:3000` |
| `npm run build` then `npm start` | Production build and server on `127.0.0.1:3000` |
| `npm run setup` | `piston:up` + `piston:install` |
| `npm run piston:up` | Start the sandbox container on `127.0.0.1:2000` |
| `npm run piston:down` | Stop the sandbox (installed languages are kept) |
| `npm run piston:install` | Install every language, or `-- <ids>` for just some |
| `npm run piston:status` | Show which languages are installed |

## Languages

| Route | Language | Runtime |
| --- | --- | --- |
| `/python` | Python 3 | Python 3.12.0 |
| `/javascript` | JavaScript | Node 20.11.1 |
| `/typescript` | TypeScript | TypeScript 5.0.3 |
| `/c` | C | GCC 10.2.0 |
| `/cpp` | C++ | GCC 10.2.0 |
| `/csharp` | C# | .NET 5.0.201 |
| `/java` | Java | Java 15.0.2 |
| `/kotlin` | Kotlin | Kotlin 1.8.20 |
| `/swift` | Swift | Swift 5.3.3 |
| `/go` | Go | Go 1.16.2 |
| `/rust` | Rust | Rust 1.68.2 |
| `/haskell` | Haskell | GHC 9.0.1 |
| `/lua` | Lua | Lua 5.4.4 |
| `/elixir` | Elixir | Elixir 1.11.3 |
| `/perl` | Perl | Perl 5.36.0 |
| `/ruby` | Ruby | Ruby 3.0.1 |
| `/php` | PHP | PHP 8.2.3 |
| `/bash` | Bash | Bash 5.2.0 |
| `/sql` | SQL | SQLite 3.36.0, with a sample database |

The badge in the top right of the compiler shows the runtime serving the
current language, or what to run if the sandbox is offline or the language
isn't installed yet.

## How it works

```
browser ──▶ Next.js on 127.0.0.1:3000 ──▶ /api/execute ──▶ Piston on 127.0.0.1:2000 ──▶ isolate sandbox
```

- The browser never talks to Piston. The Next.js server forwards runs to it.
- Both listen on `127.0.0.1` only, so nothing else on your network can reach
  them. The API also rejects requests whose `Host` isn't localhost or whose
  `Origin` is another site, so a web page you have open can't use your sandbox.
- Every run is limited by `docker-compose.yml`: no network, 10s to run, 60s to
  compile, 512 MB of memory to run (1 GB to compile), 128 processes, and 1 MB of
  output.
- Your code, layout, theme, and editor settings are saved per language in the
  browser's local storage.

## Project layout

```
app/[lang]/page.tsx          one prerendered page per language
app/api/execute/route.ts     runs code in the sandbox
app/api/runtimes/route.ts    sandbox health and installed runtimes
components/compiler/         the compiler: language rail, toolbar, editor, output
components/chrome/           header, panel shell, language menu, status badge
components/code/             CodeMirror editor and its settings
lib/compiler.ts              languages, labels, starters, file names
lib/runtimes.json            language id to Piston runtime and package
lib/piston.ts                server-side Piston client
docker-compose.yml           the sandbox and its limits
scripts/setup-piston.mjs     runtime installer
```

## Adding a language

1. `lib/runtimes.json`: the Piston runtime and package (list them with
   `curl http://127.0.0.1:2000/api/v2/packages`).
2. `lib/compiler.ts`: label, starter, file name, `COMPILER_SLUGS`, and
   `COMPILER_GROUPS`.
3. `components/compiler/lang-icon.tsx`: the rail icon.
4. `components/code/cm-editor.tsx` and `lib/code-editor-completions.ts`: syntax
   highlighting and completions.
5. `npm run piston:install -- <id>`, then run a hello world.

## Troubleshooting

- **"sandbox offline"**: start Docker Desktop, then `npm run piston:up`.
- **"isn't installed in the local sandbox yet"**: `npm run piston:install -- <id>`.
- **Slow runs on Apple Silicon**: turn on Rosetta in Docker Desktop (see
  Requirements). C# and Kotlin take a few seconds to compile even then.
- **Port 3000 is taken**: `PORT=3001 npm run dev`.
- **Windows**: use Docker Desktop with the WSL 2 backend.
- **Linux**: Piston needs cgroup v2 (the default on modern distros) and a
  privileged container.
- **Free the disk space**: `npm run piston:down`, then
  `docker volume rm hack-university-compiler_piston-packages`.
