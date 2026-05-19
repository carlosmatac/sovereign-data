"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Compact dark/light mode toggle. Renders as a small icon button.
 * Mounted lazily to avoid hydration mismatch (next-themes reads localStorage
 * on the client, so server and client may disagree on the initial theme).
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`size-7 shrink-0 rounded-[5px] ${className ?? ""}`}
        aria-hidden
      />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex size-7 shrink-0 items-center justify-center rounded-[5px] border border-transparent text-[var(--sv-text-subtle)] transition-colors duration-150 hover:border-[var(--sv-border-divider-soft)] hover:bg-[var(--sv-accent,rgba(255,255,255,0.06))] hover:text-[var(--sv-text-primary)] ${className ?? ""}`}
      style={{ color: "var(--sv-text-muted)" }}
    >
      {isDark ? (
        <Sun className="size-[13px]" strokeWidth={1.6} />
      ) : (
        <Moon className="size-[13px]" strokeWidth={1.6} />
      )}
    </button>
  );
}
