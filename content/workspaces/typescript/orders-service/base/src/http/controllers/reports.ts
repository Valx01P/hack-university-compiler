// GET /reports/daily?date=2026-09-30. The report itself is a function the composition root
// passes in (see src/reports/daily.ts), so this controller never touches the database.
import * as z from "zod";
import type { DailyReport } from "../../reports/daily.ts";
import type { RequestContext } from "../context.ts";
import { json } from "../respond.ts";
import { parseQuery } from "../validate.ts";

const DailyQuery = z.object({ date: z.iso.date() });

export function reportControllers(daily: (date: string) => DailyReport) {
  return {
    daily: (ctx: RequestContext) => {
      const { date } = parseQuery(DailyQuery, ctx.query);
      json(ctx.res, 200, daily(date));
    },
  };
}
