import { COMPILER_SLUGS } from "@/lib/compiler";
import { getReferenceData } from "@/lib/reference";

// Built once per language, and fetched only when the Reference panel opens,
// so the compiler page itself stays light.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPILER_SLUGS.map((lang) => ({ lang }));
}

export async function GET(_request: Request, context: RouteContext<"/api/reference/[lang]">) {
  const { lang } = await context.params;
  return Response.json(await getReferenceData(lang));
}
