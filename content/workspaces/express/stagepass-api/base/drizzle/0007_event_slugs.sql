-- Generated as ADD COLUMN "slug" text NOT NULL, which fails on a table that already has rows.
-- Edited by hand into three steps: expand, backfill, contract. The snapshot stays the generated one.

-- Expand: the column arrives nullable, so existing rows are allowed.
ALTER TABLE "events" ADD COLUMN "slug" text;--> statement-breakpoint

-- Backfill: each event gets a slug from its title (lowercase, every run of other characters
-- becomes "-", no "-" at either end). Later events whose title gives the same slug get "-<id>".
UPDATE "events" AS e
SET "slug" = s.base || CASE WHEN s.n > 1 THEN '-' || e.id ELSE '' END
FROM (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS n
  FROM (
    SELECT id,
           coalesce(nullif(trim(BOTH '-' FROM lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'event') AS base
    FROM "events"
  ) AS titled
) AS s
WHERE s.id = e.id;--> statement-breakpoint

-- Contract: now every row has one, so the rules can hold.
ALTER TABLE "events" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_unique" UNIQUE("slug");
