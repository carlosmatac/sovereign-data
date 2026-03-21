"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

/**
 * Forces the Sovereign dark slate theme app-wide (Tailwind `dark:` + next-themes).
 */
export function AppThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
