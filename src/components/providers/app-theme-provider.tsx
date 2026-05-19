"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

/**
 * Provides dark / light theme switching via next-themes.
 * Dark is the default for new visitors with no stored preference.
 * The user's choice is persisted in localStorage automatically.
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
      themes={["dark", "light"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
