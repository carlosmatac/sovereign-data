"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ORG_ENTITY_TYPES_PARAM = "COMPANY,ORGANIZATION,GOVERNMENT";

type Kind = "person" | "organization";

type Props = {
  /** Required for search; when empty, the field behaves as a plain text input. */
  projectId: string;
  kind: Kind;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelectedEntityIdChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Interview upload anchors: suggest existing PERSON or org-type entities (project + global)
 * after 2+ characters. Selecting an option sets canonical name + entity id for the API.
 */
export function InterviewAnchorEntityInput({
  projectId,
  kind,
  id,
  value,
  onChange,
  onSelectedEntityIdChange,
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

  const canSearch = projectId.trim().length > 0;
  const q = value.trim();
  const showPopover =
    canSearch && q.length >= 2 && !disabled && results.length > 0 && !loading;

  useEffect(() => {
    if (!canSearch || value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setResults([]);

    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const typeQuery =
          kind === "person"
            ? "type=PERSON"
            : `types=${encodeURIComponent(ORG_ENTITY_TYPES_PARAM)}`;
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/entities/search?q=${encodeURIComponent(value.trim())}&${typeQuery}`
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
  }, [value, projectId, kind, canSearch, refetchNonce]);

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
          className="h-9 text-sm"
          onChange={(e) => {
            onChange(e.target.value);
            onSelectedEntityIdChange(null);
          }}
          onFocus={() => {
            clearBlurTimer();
            if (
              canSearch &&
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
                  onSelectedEntityIdChange(e.id);
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
