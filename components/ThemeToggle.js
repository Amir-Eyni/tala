"use client";

import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      aria-label="تغییر تم روشن و تاریک"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-brand shadow-sm transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      onClick={() =>
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
      }
      title="تغییر تم"
      type="button"
    >
      <svg
        aria-hidden="true"
        className="size-5 dark:hidden"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2.5v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.22-6.72-1.42 1.42M6.7 17.3l-1.42 1.42m13.44 0-1.42-1.42M6.7 6.7 5.28 5.28"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="hidden size-5 dark:block"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </button>
  );
}
