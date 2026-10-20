import { Price } from "@/components/price";
import type { Product } from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <img
        src={product.image}
        alt={product.name}
        width={800}
        height={600}
        loading="lazy"
        className="aspect-4/3 w-full object-cover"
      />
      <div className="flex items-baseline justify-between gap-4 p-4">
        <h2 className="font-medium">{product.name}</h2>
        <p className="text-stone-700">
          <Price cents={product.priceCents} />
        </p>
      </div>
    </article>
  );
}
