import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-4 text-stone-600">We couldn’t find the page you were looking for.</p>
      <Link href="/" className="mt-8 inline-block font-medium text-brand underline underline-offset-4">
        Back to the home page
      </Link>
    </main>
  );
}
