import type { Metadata } from "next";
import { Gabarito } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppThemeProvider } from "@/components/providers/app-theme-provider";
import "./globals.css";

const gabarito = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sovereign Data — Frontier Markets Intelligence",
  description:
    "Transform exclusive interviews into actionable business intelligence for emerging markets.",
  icons: {
    icon: [
      { url: "/sovereign_log_fondo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/sovereign_log_fondo.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${gabarito.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AppThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
