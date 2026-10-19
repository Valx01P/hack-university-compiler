import { COMPILER_COURSES } from "@/lib/courses";
import { getReferenceData } from "@/lib/reference";

// Built once per course with a compiler page, and fetched only when the
// Reference panel opens, so the compiler page itself stays light.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPILER_COURSES.map((c) => ({ lang: c.slug }));
}

export async function GET(_request: Request, context: RouteContext<"/api/reference/[lang]">) {
  const { lang } = await context.params;
  return Response.json(await getReferenceData(lang));
}
