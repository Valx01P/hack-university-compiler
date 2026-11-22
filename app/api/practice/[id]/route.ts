import { PRACTICE, isPracticeId, readPractice } from "@/lib/practice";

// A practice folder's files (lib/practice.ts), built once and fetched only
// when a lesson's link asks the Playground to add one.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PRACTICE).map((id) => ({ id }));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isPracticeId(id)) return Response.json({ error: "No such practice folder." }, { status: 404 });
  return Response.json(await readPractice(id));
}
