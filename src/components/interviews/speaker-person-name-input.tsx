"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Free-text speaker name with optional suggestions from PERSON entities (project + global),
 * after at least 2 characters. The suggestion panel only appears when there are matches.
 */
export function SpeakerPersonNameInput({
  projectId,
  id,
  value,
  onChange,
  disabled,
  placeholder,
  "aria-label": ariaLabel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [refetchNonce, setRefetchNonce] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const q = value.trim();
  const showPopover =
    q.length >= 2 && !disabled && results.length > 0 && !loading;

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setResults([]);

    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/entities/search?q=${encodeURIComponent(trimmed)}&type=PERSON`
        );
        const json = (await res.json()) as {
          entities?: Array<{ id: string; name: string }>;
        };
        if (res.ok && Array.isArray(json.entities)) {
          setResults(
            json.entities.map((e) => ({ id: e.id, name: e.name }))
          );
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [value, projectId, refetchNonce]);

  return (
    <Popover
      open={showPopover}
      onOpenChange={(next) => {
        if (!next) setResults([]);
      }}
      modal={false}
    >
      <PopoverAnchor asChild>
        <Input
          id={id}
          value={value}
          disabled={disabled}
          maxLength={120}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={showPopover}
          role="combobox"
          className="h-8 border-[rgba(147,147,147,0.10)] bg-white/[0.025] text-sm text-white/85 shadow-none placeholder:text-white/30 focus-visible:border-[rgba(147,147,147,0.24)] focus-visible:ring-0"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            clearBlurTimer();
            if (
              value.trim().length >= 2 &&
              resultsRef.current.length === 0
            ) {
              setRefetchNonce((n) => n + 1);
            }
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setResults([]);
              setLoading(false);
            }, 200);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn(
          "max-h-60 w-[var(--radix-popover-anchor-width)] min-w-[12rem] overflow-y-auto p-1"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="py-1" role="listbox">
          {results.map((e) => (
            <li key={e.id} role="option">
              <button
                type="button"
                className="hover:bg-accent focus:bg-accent flex w-full rounded-sm px-2 py-1.5 text-left text-sm outline-none"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  clearBlurTimer();
                  onChange(e.name);
                  setResults([]);
                }}
              >
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
