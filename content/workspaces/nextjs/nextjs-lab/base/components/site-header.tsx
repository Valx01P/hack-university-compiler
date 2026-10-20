import Image from "next/image";
import Link from "next/link";

const navLinks = [
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "Trailhead";

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
          <Image src="/logo.svg" alt="" width={32} height={32} />
          {storeName}
        </Link>
        <nav aria-label="Main">
          <ul className="flex gap-6 text-sm font-medium">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-brand">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
