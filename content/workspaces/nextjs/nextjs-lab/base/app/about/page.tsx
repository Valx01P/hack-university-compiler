import { team } from "@/lib/team";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-semibold">About Trailhead</h1>
      <p className="mt-4 max-w-2xl text-lg text-stone-700">
        Trailhead is a small outdoor shop run by people who carry what they sell.
      </p>

      <section aria-labelledby="team-heading" className="mt-12">
        <h2 id="team-heading" className="text-xl font-semibold">
          Our team
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {team.map((member) => (
            <li key={member.name} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="font-medium">{member.name}</p>
              <p className="text-sm text-brand">{member.role}</p>
              <p className="mt-2 text-sm text-stone-600">{member.bio}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
