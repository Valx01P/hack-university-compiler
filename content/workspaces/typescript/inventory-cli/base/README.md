# Stockroom

The command-line tool a small shop uses to keep track of its stock. It keeps the
inventory in `data/inventory.json`, and every command reads that file, changes it if it
needs to, and prints the result. Node 26 runs the TypeScript directly (no build step), and
TypeScript 7 checks it.

```sh
node src/cli.ts list --low
npm run cli -- report --format markdown
```

## Commands

| Command | What it does |
| --- | --- |
| `list [--low] [--category <name>] [--json]` | Shows the items as a table, only the low ones (at or below `STOCKROOM_LOW_STOCK`), only one category, or as JSON |
| `add <sku> --name <name> --qty <n> --price <12.50> --category <name>` | Adds a new item. SKUs look like `MUG-001`: three capitals, a dash, three digits |
| `adjust <sku> <change> --reason <sale\|restock\|damage\|count>` | Changes one quantity and says why: `adjust MUG-001 -3 --reason sale` |
| `remove <sku>` | Removes an item |
| `report [--format table\|csv\|json\|markdown]` | Units and stock value per category, and the total |
| `import <file.csv>` | Adds a delivery from a CSV file with the header `sku,name,category,qty,price` |
| `--help`, `--version` | The list of commands, and `stockroom 1.4.0` |

Exit codes: 0 when it worked, 2 for a mistake on the command line (a bad SKU, an unknown
option), 3 when the SKU is not in the inventory, and 1 when the data file is broken.

## npm scripts

| Script | What it runs |
| --- | --- |
| `npm run cli -- <command>` | `node --env-file=.env src/cli.ts`: the CLI with the settings in `.env` |
| `npm run dev` | `list` again every time you save a file (`node --watch`) |
| `npm run typecheck` | `tsc`: type-checks `src`, `test`, and `type-tests` |
| `npm run lint` | ESLint with typescript-eslint's type-aware rules |
| `npm test` | `node --test "test/**/*.test.ts"` |
| `npm run check` | typecheck, then lint, then test, stopping at the first failure |
| `npm run data:reset` | Copies `fixtures/seed.json` over `data/inventory.json` |

## How the code is laid out

```text
src/cli.ts              entry point: settings, finds the command, runs it, maps errors to exit codes
src/config.ts           reads STOCKROOM_DATA, STOCKROOM_LOW_STOCK, and HU_FIXED_TIME once
src/clock.ts            the Clock every command gets instead of calling new Date()
src/errors.ts           CliError and its two kinds, InvalidInputError (2) and NotFoundError (3)
src/commands/           one file per command, the registry (index.ts), and the Command type
src/domain/             the rules, with no I/O: items and SKUs, money in cents, stock movements
src/storage/            the data file: its zod schema, loading and saving, the version 1 upgrade
src/format/             output: plain-text tables, CSV, Markdown tables
test/                   node:test tests, from the domain up to the CLI as a child process
type-tests/             compile-only tests that tsc checks and nothing runs
fixtures/               the seed, an old version 1 file, a broken file, and a CSV delivery
```

Lessons often start from an earlier version of Stockroom (one big file, a looser
tsconfig, no ESLint yet), so some of these files may be missing or different there: each
part says what it starts from.

Imports between these folders go through the `#` subpath imports in `package.json`
(`#domain/*`, `#storage/*`, `#format/*`, `#commands/*`), so a file can move without
breaking `../../` chains, and Node resolves them with no build step.

## One command, through every layer

`node src/cli.ts adjust MUG-001 -3 --reason sale` prints `MUG-001: 24 -> 21 (sale)`:

1. `src/cli.ts` reads the arguments. `negativeNumbersLast` moves `-3` behind `--`, because
   `util.parseArgs` would read it as an option. `isCommandName` narrows `"adjust"` to a key
   of the registry.
2. `src/config.ts` turns the environment into a `Config`: the data path, the threshold, and
   a fixed clock when `HU_FIXED_TIME` is set.
3. `src/commands/index.ts` maps `adjust` to the command in `src/commands/adjust.ts`, and
   `cli.ts` calls its `run` with a context: a `JsonStore`, the clock, and `out`.
4. `src/commands/adjust.ts` parses its own options with `parseArgs` (so `values.reason` is
   typed), checks the change and the reason, and loads the inventory.
5. `src/storage/json-store.ts` reads the file and runs it through the `InventoryFile` schema
   in `src/storage/schema.ts`, so what comes back is typed and valid.
6. `src/domain/stock.ts` applies the rule: `adjustStock` returns `{ ok: true, item }`, or an
   error such as `below_zero`, and never throws.
7. The command stamps `updatedAt` from the clock and saves. `saveInventory` writes
   `data/.inventory.tmp` and renames it over `data/inventory.json`.
8. `formatMovement` builds the line, and `out` prints it. Had the item been missing, the
   command would have thrown `NotFoundError`, and `cli.ts` would have printed its message
   on stderr and exited with 3.

## The data file

```json
{
  "version": 2,
  "items": [
    { "sku": "MUG-001", "name": "Ceramic Mug", "category": "kitchen", "qty": 24, "priceCents": 1299, "updatedAt": "2026-09-30T17:00:00.000Z" }
  ]
}
```

Prices are whole cents (`1299` is $12.99), so sums never pick up float errors. Version 1
files stored prices as text (`"price": "12.99"`). Stockroom still reads them and writes
them back as version 2. Categories are `kitchen`, `office`, and `garden`.

## Settings

`.env` holds them (`.env.example` documents each one). `STOCKROOM_DATA` picks another data file,
`STOCKROOM_LOW_STOCK` the threshold (5), and `HU_FIXED_TIME` freezes the clock, which Hack
University sets to `2026-10-01T09:00:00Z` so every `updatedAt` is predictable.
