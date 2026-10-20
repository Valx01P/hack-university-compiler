import { ProductCard } from "@/components/product-card";
import { listProducts } from "@/lib/catalog";

export default function ProductsPage() {
  const products = listProducts();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Products</h1>
      <p className="mt-2 text-stone-600">{products.length} products</p>
      <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.slug}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </main>
  );
}
