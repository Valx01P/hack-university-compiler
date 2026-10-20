// The context behind useToast(). ToastProvider (Toast.tsx) supplies it near the root.
import { createContext, use } from "react";

export type ToastTone = "info" | "success" | "danger";

export type ShowToast = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/** Returns toast(message, tone): a short message that disappears by itself after 5 seconds. */
export function useToast(): ShowToast {
  const toast = use(ToastContext);
  if (!toast) throw new Error("useToast needs a <ToastProvider> above it");
  return toast;
}
