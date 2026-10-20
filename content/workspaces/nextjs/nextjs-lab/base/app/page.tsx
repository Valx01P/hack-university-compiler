import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { listProducts } from "@/lib/catalog";

export default function HomePage() {
  const featured = listProducts().slice(0, 3);

  return (
    <main>
      <section className="relative isolate overflow-hidden bg-brand-dark text-white">
        <Image
          src="/images/hero.jpg"
          alt=""
          fill
          preload
          sizes="100vw"
          className="-z-10 object-cover opacity-80"
        />
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Trailhead Outfitters</h1>
          <p className="mt-4 max-w-xl text-lg">Gear for long days outside.</p>
          <Link
            href="/products"
            className="mt-8 inline-block rounded-md bg-white px-4 py-2 font-medium text-brand-dark hover:bg-brand-light"
          >
            Shop all gear
          </Link>
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="mx-auto max-w-6xl px-6 py-16">
        <h2 id="featured-heading" className="text-2xl font-semibold">
          Featured gear
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
