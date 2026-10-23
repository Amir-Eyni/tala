import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and resolve Tailwind CSS conflicts.
 *
 * @param {...unknown} inputs - Class values accepted by clsx.
 * @returns {string} The merged class string.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
