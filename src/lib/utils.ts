import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a taka amount for compact display (e.g. chart axes).
 * Only abbreviates to k/M once the value is actually large enough to need it —
 * small values (like 0 or a handful of taka) are shown as plain numbers
 * instead of misleading fractions like "0.004k".
 */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    return `৳${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }

  if (abs >= 1_000) {
    const thousands = value / 1_000;
    return `৳${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }

  return `৳${value.toLocaleString()}`;
}
