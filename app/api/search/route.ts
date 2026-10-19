import { NextResponse } from "next/server";
import { rejectNonLocal } from "@/lib/local-request";
import { searchCheatsheet } from "@/lib/search/cheatsheet-search";

export const dynamic = "force-dynamic";

const LANGUAGES = new Set(["python", "javascript", "cpp", "java", "go", "sql"]);

/** Ranked cheatsheet search: GET /api/search?lang=python&q=list+methods. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "";
  if (!LANGUAGES.has(lang)) return NextResponse.json({ error: "Unknown language." }, { status: 400 });
  const result = await searchCheatsheet(lang, url.searchParams.get("q") ?? "");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
