import { NextResponse } from "next/server";
import { isCompilerCourse } from "@/lib/courses";
import { rejectNonLocal } from "@/lib/local-request";

/**
 * Remembers the compiler you're on, for the homepage redirect in
 * next.config.ts: POST {lang} answers with the hu-lang cookie. Only the
 * compiler page's mount effect calls it, which runs on a real visit and
 * never for a prefetch, so hovering the rail (or Next prefetching the links
 * in view) never changes where the homepage goes. The cookie is HttpOnly:
 * lesson previews on other localhost ports share this cookie jar, and none
 * of them may read or rewrite it.
 */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  let lang: unknown;
  try {
    ({ lang } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (typeof lang !== "string" || !isCompilerCourse(lang)) {
    return NextResponse.json({ error: "Unknown course." }, { status: 400 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Set-Cookie": `hu-lang=${lang}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`,
      "Cache-Control": "no-store",
    },
  });
}
