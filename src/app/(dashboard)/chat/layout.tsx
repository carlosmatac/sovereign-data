import type { ReactNode } from "react";

/**
 * Chat content only — conversation list lives under Intelligence Chat in the app sidebar.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] max-h-[calc(100dvh-2.5rem)] w-full min-w-0 flex-col overflow-hidden">
      {children}
    </div>
  );
}
