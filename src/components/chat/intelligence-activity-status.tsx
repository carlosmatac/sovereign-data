"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * User-facing activity list while Intelligence Chat is working.
 * Copy is illustrative (not live tool telemetry) — never exposes chain-of-thought.
 */
const PREP_STEPS = [
  "Searching interview database",
  "Resolving entities",
  "Checking relationships",
  "Collecting evidence",
  "Checking public sources",
] as const;

const STREAMING_LABEL = "Drafting response";

export function IntelligenceActivityStatus({
  phase,
  variant = "default",
}: {
  /** `submitted` = request in flight before tokens; `streaming` = model output in progress */
  phase: "submitted" | "streaming";
  /** `dark` = optional slate console (unused by default chat skin) */
  variant?: "default" | "dark";
}) {
  const [prepIndex, setPrepIndex] = useState(0);

  useEffect(() => {
    if (phase !== "submitted") return;
    const id = setInterval(() => {
      setPrepIndex((i) => Math.min(i + 1, PREP_STEPS.length - 1));
    }, 1700);
    return () => clearInterval(id);
  }, [phase]);

  const prepComplete = phase === "streaming";

  const surface =
    variant === "dark"
      ? "border-[1.5px] border-white/12 bg-[#181c26]/95 shadow-[0_4px_28px_-8px_rgba(0,0,0,0.45)] backdrop-blur-sm ring-1 ring-inset ring-white/[0.04]"
      : "border-border bg-card shadow-sm ring-1 ring-border/40";

  return (
    <div
      className={cn("w-full max-w-md rounded-2xl border px-5 py-4", surface)}
      aria-busy="true"
      aria-live="polite"
      aria-label="Intelligence chat is working on your question"
    >
      <p
        className={cn(
          "mb-3 text-xs font-medium uppercase tracking-wide",
          variant === "dark" ? "text-slate-500" : "text-muted-foreground"
        )}
      >
        Working on your answer
      </p>
      <ul className="space-y-2.5">
        {PREP_STEPS.map((label, i) => {
          const done = prepComplete || i < prepIndex;
          const active =
            phase === "submitted" && i === prepIndex && !prepComplete;

          return (
            <li
              key={label}
              className={cn(
                "flex items-start gap-2.5 text-sm transition-colors",
                variant === "dark"
                  ? cn(
                      done && "text-slate-500",
                      active && "font-medium text-slate-200",
                      !done && !active && "text-slate-600"
                    )
                  : cn(
                      done && "text-muted-foreground",
                      active && "font-medium text-foreground",
                      !done && !active && "text-muted-foreground/60"
                    )
              )}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 stroke-[2.5]",
                      variant === "dark" ? "text-sky-400" : "text-primary"
                    )}
                  />
                ) : active ? (
                  <Loader2
                    className={cn(
                      "h-3.5 w-3.5 animate-spin",
                      variant === "dark" ? "text-sky-400" : "text-primary"
                    )}
                    aria-hidden
                  />
                ) : (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      variant === "dark"
                        ? "bg-slate-600"
                        : "bg-muted-foreground/25"
                    )}
                  />
                )}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
        <li
          className={cn(
            "flex items-start gap-2.5 border-t pt-2.5 text-sm",
            variant === "dark"
              ? "border-white/10"
              : "border-border",
            prepComplete
              ? variant === "dark"
                ? "font-medium text-slate-200"
                : "font-medium text-foreground"
              : variant === "dark"
                ? "text-slate-600"
                : "text-muted-foreground/70"
          )}
        >
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
            {prepComplete ? (
              <Loader2
                className={cn(
                  "h-3.5 w-3.5 animate-spin",
                  variant === "dark" ? "text-sky-400" : "text-primary"
                )}
                aria-hidden
              />
            ) : (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  variant === "dark"
                    ? "bg-slate-600"
                    : "bg-muted-foreground/20"
                )}
              />
            )}
          </span>
          <span>{STREAMING_LABEL}</span>
        </li>
      </ul>
    </div>
  );
}
