export type Inventory = {
  slug: string;
  stock: number;
  warehouse: string;
};

export type ReviewSummary = {
  average: number;
  count: number;
};

export type Review = {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
};

export type ShippingEstimate = {
  days: number;
};

export type Recommendations = {
  slug: string;
  related: string[];
};

export type Deal = {
  id: string;
  productSlug: string;
  title: string;
  priceCents: number;
  salePriceCents: number;
  endsAt: string;
};

export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
};

function serviceUrl(path: string): string {
  const base = process.env.MOCK_API_URL;
  if (!base) {
    throw new Error("MOCK_API_URL is not set. It belongs in .env (http://localhost:4000).");
  }
  return new URL(path, base).toString();
}

// A 404 means "the service has nothing for this slug", which callers render as a normal state.
async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(serviceUrl(path));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function getInventory(slug: string): Promise<Inventory | null> {
  return getJson<Inventory>(`/inventory/${encodeURIComponent(slug)}`);
}

export function getReviewSummary(slug: string): Promise<ReviewSummary | null> {
  return getJson<ReviewSummary>(`/reviews/${encodeURIComponent(slug)}/summary`);
}

export async function getReviews(slug: string): Promise<Review[]> {
  return (await getJson<Review[]>(`/reviews/${encodeURIComponent(slug)}`)) ?? [];
}

export function getShippingEstimate(slug: string): Promise<ShippingEstimate | null> {
  return getJson<ShippingEstimate>(`/shipping/${encodeURIComponent(slug)}`);
}

export async function getRecommendations(slug: string): Promise<string[]> {
  const recommendations = await getJson<Recommendations>(`/recommendations/${encodeURIComponent(slug)}`);
  return recommendations?.related ?? [];
}

export async function getDeals(): Promise<Deal[]> {
  return (await getJson<Deal[]>("/deals")) ?? [];
}

export async function getFaq(): Promise<FaqEntry[]> {
  return (await getJson<FaqEntry[]>("/faq")) ?? [];
}
