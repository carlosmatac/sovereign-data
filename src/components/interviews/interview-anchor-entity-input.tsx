"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ORG_LIKE_ENTITY_TYPES } from "@/types/database";
import { Loader2, Link2, X } from "lucide-react";

const ORG_ENTITY_TYPES_PARAM = ORG_LIKE_ENTITY_TYPES.join(",");

type Kind = "person" | "organization";

type EntityResult = {
  id: string;
  name: string;
  scope: "project" | "global";
};

type Props = {
  /** Required for search; when empty, the field behaves as a plain text input. */
  projectId: string;
  kind: Kind;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelectedEntityIdChange: (id: string | null) => void;
  /** Pass the currently selected entity id so the component can show the "linked" chip. */
  selectedEntityId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  /**
   * When set, overrides the `kind`-based type filter in the entity search URL.
   * Pass the raw query-string fragment, e.g. `"type=PERSON"` or
   * `"types=COMPANY,ORGANIZATION"`. Pass `""` to search across all types.
   */
  typeFilter?: string;
  /**
   * Label used in "no existing match" hint text when `typeFilter` is set.
   * Defaults to the `kind` label when omitted.
   */
  entityLabel?: string;
};

/**
 * Interview upload anchors: suggest existing PERSON or org-type entities (project + global)
 * after 2+ characters. Selecting an option sets canonical name + entity id for the API.
 *
 * UX states:
 * - typing (length < 2): plain input
 * - debounce in flight / loading: spinner in popover
 * - results returned: list with project/global scope badges
 * - queried but empty: "no match — will create" hint
 * - entity selected: "linked" chip with clear action
 */
export function InterviewAnchorEntityInput({
  projectId,
  kind,
  id,
  value,
  onChange,
  onSelectedEntityIdChange,
  selectedEntityId,
  disabled,
  placeholder,
  "aria-label": ariaLabel,
  typeFilter,
  entityLabel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EntityResult[]>([]);
  /**
   * true once the last debounced fetch resolved (success or error) for the
   * current value — lets us distinguish "waiting" from "searched, nothing found".
   */
  const [queried, setQueried] = useState(false);
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
    canSearch &&
    q.length >= 2 &&
    !disabled &&
    (loading || results.length > 0 || queried);

  useEffect(() => {
    if (!canSearch || value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setQueried(false);
      return;
    }

    setResults([]);
    setQueried(false);

    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const typeQuery =
          typeFilter !== undefined
            ? typeFilter
            : kind === "person"
              ? "type=PERSON"
              : `types=${encodeURIComponent(ORG_ENTITY_TYPES_PARAM)}`;
        const separator = typeQuery ? "&" : "";
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/entities/search?q=${encodeURIComponent(value.trim())}${separator}${typeQuery}`
        );
        const json = (await res.json()) as {
          entities?: Array<{ id: string; name: string; scope?: "project" | "global" }>;
        };
        if (res.ok && Array.isArray(json.entities)) {
          setResults(
            json.entities.map((e) => ({
              id: e.id,
              name: e.name,
              scope: e.scope ?? "project",
            }))
          );
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setQueried(true);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [value, projectId, kind, typeFilter, canSearch, refetchNonce]);

  return (
    <div>
      <Popover
        open={showPopover}
        onOpenChange={(next) => {
          if (!next) {
            setResults([]);
            setQueried(false);
          }
        }}
        modal={false}
      >
        <PopoverAnchor asChild>
          <Input
            id={id}
            name={id}
            value={value}
            disabled={disabled}
            maxLength={120}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-expanded={showPopover}
            role="combobox"
            autoComplete="new-password"
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
                setQueried(false);
                setRefetchNonce((n) => n + 1);
              }
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => {
                setResults([]);
                setLoading(false);
                setQueried(false);
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
            {loading && (
              <li className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </li>
            )}
            {!loading && queried && results.length === 0 && (
              <li
                className="px-2 py-2 text-sm text-muted-foreground"
                role="option"
                aria-selected={false}
                aria-disabled={true}
              >
                No existing match — submitting will create a new{" "}
                {entityLabel ?? (kind === "person" ? "person" : "organization")}{" "}
                <span className="font-medium text-foreground">
                  &ldquo;{value}&rdquo;
                </span>{" "}
                in this project.
              </li>
            )}
            {!loading &&
              results.map((e) => (
                <li key={e.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="hover:bg-accent focus:bg-accent flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      clearBlurTimer();
                      onChange(e.name);
                      onSelectedEntityIdChange(e.id);
                      setResults([]);
                      setQueried(false);
                    }}
                  >
                    <span className="min-w-0 truncate">{e.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                        e.scope === "project"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {e.scope === "project" ? "Project" : "Global"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </PopoverContent>
      </Popover>

      {selectedEntityId && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Link2 className="h-3 w-3" />
            Linked to existing entity
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            onClick={() => {
              onChange("");
              onSelectedEntityIdChange(null);
            }}
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
