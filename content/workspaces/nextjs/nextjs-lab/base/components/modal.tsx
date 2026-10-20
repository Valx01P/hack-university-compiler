"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// Built for intercepted routes: the modal opens on mount, and closing it in any way
// (the Close button, Escape, or a click on the backdrop) goes back to the page below.
export function Modal({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={() => router.back()}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
      className="m-auto w-full max-w-lg rounded-xl p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="p-6">{children}</div>
      <form method="dialog" className="border-t border-stone-200 px-6 py-3 text-right">
        <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium">Close</button>
      </form>
    </dialog>
  );
}
