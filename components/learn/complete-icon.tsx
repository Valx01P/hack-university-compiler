import { Check } from "lucide-react";

/** The green "complete" mark: a check in a filled circle. */
export function CompleteIcon({ className = "size-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full bg-complete text-canvas ${className}`}
    >
      <Check className="size-[70%]" strokeWidth={3.5} />
    </span>
  );
}

/** Not complete yet: an empty ring the same size, so rows never shift when a
    lesson flips to complete. */
export function PendingIcon({
  className = "size-4",
  current = false,
}: {
  className?: string;
  current?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border-[1.5px] ${
        current ? "border-ink dark:border-gold" : "border-edge-strong/50"
      } ${className}`}
    />
  );
}
