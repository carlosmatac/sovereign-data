"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

/**
 * Editorial / brief styling for Intelligence Chat assistant output.
 * Uses semantic theme tokens (dark slate app default).
 */
const briefComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-10 border-b border-border pb-2 text-base font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-9 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-7 text-sm font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-5 text-sm font-medium text-foreground first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-4 text-[15px] leading-[1.65] text-foreground/90 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-5 ml-0 list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-foreground/90 marker:text-muted-foreground [&_ul]:mt-2 [&_ol]:mt-2">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-5 ml-0 list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-foreground/90 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 [&>p]:mb-2 [&>p:last-child]:mb-0">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-l-[3px] border-primary/25 bg-muted/40 py-3 pl-4 pr-3 text-[14px] leading-relaxed text-muted-foreground [&_p]:mb-2 [&_p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const linkClass =
      "font-medium text-primary underline decoration-primary/25 underline-offset-2 transition-colors hover:decoration-primary/50";

    // Internal app route — use Next.js client-side navigation.
    if (href?.startsWith("/")) {
      return (
        <Link href={href} className={linkClass}>
          {children}
        </Link>
      );
    }

    // The model sometimes generates thebusinessyear.com/interview/… URLs from
    // training knowledge. Those don't exist inside the platform. Redirect to
    // the All Interviews page so the user can find the interview there.
    if (href && /thebusinessyear\.com\/interview/i.test(href)) {
      return (
        <Link href="/interviews" className={linkClass} title="Opens All Interviews — the direct link is not available in this view">
          {children}
        </Link>
      );
    }

    // External URL — open in a new tab.
    return (
      <a
        href={href}
        className={linkClass}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  hr: () => <hr className="my-8 border-0 border-t border-border" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground">{children}</em>
  ),
  pre: ({ children }) => (
    <pre className="mb-5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-[13px] leading-relaxed text-foreground">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md bg-muted px-1.5 py-0.5 text-[13px] text-foreground"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function IntelligenceBriefMarkdown({ children }: { children: string }) {
  return (
    <div className="intelligence-brief-markdown">
      <ReactMarkdown components={briefComponents}>{children}</ReactMarkdown>
    </div>
  );
}
