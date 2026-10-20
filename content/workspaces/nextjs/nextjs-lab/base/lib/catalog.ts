export type CategorySlug = "packs" | "tents" | "apparel" | "cooking";

export type Category = {
  slug: CategorySlug;
  title: string;
  description: string;
  banner: string;
};

export type Product = {
  slug: string;
  name: string;
  category: CategorySlug;
  priceCents: number;
  description: string;
  image: string;
  inStock: boolean;
  specs: {
    weight: string;
    material: string;
  };
};

const categories: Category[] = [
  {
    slug: "packs",
    title: "Packs",
    description: "Daypacks, hip packs, and packs for overnight trips.",
    banner: "/images/categories/packs.webp",
  },
  {
    slug: "tents",
    title: "Tents",
    description: "Shelters for one to four people, from fast and light to basecamp.",
    banner: "/images/categories/tents.webp",
  },
  {
    slug: "apparel",
    title: "Apparel",
    description: "Layers that keep you warm, dry, and moving.",
    banner: "/images/categories/apparel.webp",
  },
  {
    slug: "cooking",
    title: "Cooking",
    description: "Stoves, pots, and kettles for hot meals outside.",
    banner: "/images/categories/cooking.webp",
  },
];

const products: Product[] = [
  {
    slug: "trail-pack-45",
    name: "Trail Pack 45L",
    category: "packs",
    priceCents: 18900,
    description:
      "A 45-liter pack for multi-day trips, with a floating lid, an adjustable torso, and side pockets you can reach while walking.",
    image: "/images/products/trail-pack-45.webp",
    inStock: true,
    specs: { weight: "1.4 kg", material: "210D nylon ripstop" },
  },
  {
    slug: "summit-daypack-22",
    name: "Summit Daypack 22L",
    category: "packs",
    priceCents: 8900,
    description: "A light daypack with a hydration sleeve, a padded hip belt, and room for a shell and lunch.",
    image: "/images/products/summit-daypack-22.webp",
    inStock: true,
    specs: { weight: "0.7 kg", material: "100D recycled nylon" },
  },
  {
    slug: "hip-pack-5",
    name: "Hip Pack 5L",
    category: "packs",
    priceCents: 3900,
    description: "A 5-liter hip pack for runs and short hikes, with two water-resistant zip pockets.",
    image: "/images/products/hip-pack-5.webp",
    inStock: false,
    specs: { weight: "200 g", material: "Coated polyester" },
  },
  {
    slug: "ridge-2p-tent",
    name: "Ridge 2P Tent",
    category: "tents",
    priceCents: 34900,
    description:
      "A freestanding two-person tent with a double-wall ripstop fly, two doors, and two vestibules for wet gear.",
    image: "/images/products/ridge-2p-tent.webp",
    inStock: true,
    specs: { weight: "1.8 kg", material: "20D silicone-coated nylon" },
  },
  {
    slug: "alpine-1p-tent",
    name: "Alpine 1P Tent",
    category: "tents",
    priceCents: 27900,
    description: "A low, wind-shedding solo tent that pitches fly first in a storm.",
    image: "/images/products/alpine-1p-tent.webp",
    inStock: false,
    specs: { weight: "1.1 kg", material: "15D nylon ripstop" },
  },
  {
    slug: "basecamp-4p-tent",
    name: "Basecamp 4P Tent",
    category: "tents",
    priceCents: 52900,
    description: "A roomy dome for four, with standing height in the middle and a large front vestibule.",
    image: "/images/products/basecamp-4p-tent.webp",
    inStock: true,
    specs: { weight: "4.6 kg", material: "68D polyester" },
  },
  {
    slug: "storm-shell-jacket",
    name: "Storm Shell Jacket",
    category: "apparel",
    priceCents: 21900,
    description: "A waterproof, breathable three-layer shell with pit zips and a helmet-compatible hood.",
    image: "/images/products/storm-shell-jacket.webp",
    inStock: true,
    specs: { weight: "400 g", material: "3-layer waterproof nylon" },
  },
  {
    slug: "merino-base-layer",
    name: "Merino Base Layer",
    category: "apparel",
    priceCents: 9500,
    description: "A long-sleeve crew in soft merino wool that stays warm when damp and resists odor.",
    image: "/images/products/merino-base-layer.webp",
    inStock: true,
    specs: { weight: "200 g", material: "100% merino wool" },
  },
  {
    slug: "trail-runner-cap",
    name: "Trail Runner Cap",
    category: "apparel",
    priceCents: 2800,
    description: "A light, quick-drying cap with a soft brim that packs flat.",
    image: "/images/products/trail-runner-cap.webp",
    inStock: true,
    specs: { weight: "60 g", material: "Recycled polyester" },
  },
  {
    slug: "ember-stove",
    name: "Ember Stove",
    category: "cooking",
    priceCents: 6400,
    description: "A compact canister stove that boils a liter of water in about four minutes.",
    image: "/images/products/ember-stove.webp",
    inStock: true,
    specs: { weight: "85 g", material: "Titanium and aluminum" },
  },
  {
    slug: "titan-pot-set",
    name: "Titan Pot Set",
    category: "cooking",
    priceCents: 7900,
    description: "Two nesting titanium pots with a lid that doubles as a frying pan.",
    image: "/images/products/titan-pot-set.webp",
    inStock: true,
    specs: { weight: "310 g", material: "Titanium" },
  },
  {
    slug: "camp-kettle-1l",
    name: "Camp Kettle 1L",
    category: "cooking",
    priceCents: 3400,
    description: "A one-liter aluminum kettle with a pour spout and a folding handle.",
    image: "/images/products/camp-kettle-1l.webp",
    inStock: true,
    specs: { weight: "180 g", material: "Hard-anodized aluminum" },
  },
];

export function listCategories(): Category[] {
  return [...categories];
}

export function getCategory(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function listProducts(): Product[] {
  return [...products];
}

export function listProductsInCategory(category: string): Product[] {
  return products.filter((product) => product.category === category);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}
