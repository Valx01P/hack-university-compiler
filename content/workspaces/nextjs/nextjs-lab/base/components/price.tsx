import { formatPrice } from "@/lib/format";

export function Price({ cents }: { cents: number }) {
  return <span className="tabular-nums">{formatPrice(cents)}</span>;
}
