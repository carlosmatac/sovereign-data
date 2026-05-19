/**
 * SourceEntityList — read-only display of the unified source-entity set.
 *
 * Accepts `SourceEntityItem[]` from `getSourceEntityItems` and renders each
 * entry with its entity-type icon, name, type badge, role label, and optional
 * source-scoped context text.
 *
 * Used on both the Source Detail page and the Transcript Review entity panel
 * so both surfaces always show the same data in the same visual format.
 *
 * Spec: docs/features/on-going/source-all-related-entities-panel.md
 */

import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Clock,
  MapPin,
  User,
} from "lucide-react";
import type { SourceEntityItem } from "@/lib/entities/source-entity-aggregator";

// ── Icons (matching EntityMentionsList vocabulary) ────────────────────────────

const SdIcon = ({ className }: { className?: string }) => (
  <img src="/ak.svg" alt="" className={className} aria-hidden />
);

const ENTITY_ICON: Record<string, React.ReactNode> = {
  PERSON: <User className="h-3.5 w-3.5" />,
  COMPANY: <Building2 className="h-3.5 w-3.5" />,
  GOVERNMENT: <SdIcon className="h-3.5 w-3.5" />,
  ORGANIZATION: <SdIcon className="h-3.5 w-3.5" />,
  LOCATION: <MapPin className="h-3.5 w-3.5" />,
  EVENT: <Clock className="h-3.5 w-3.5" />,
  COUNTRY: <MapPin className="h-3.5 w-3.5" />,
  SECTOR: <Building2 className="h-3.5 w-3.5" />,
  COMMODITY: <Building2 className="h-3.5 w-3.5" />,
  PUBLIC_INSTITUTION: <SdIcon className="h-3.5 w-3.5" />,
  STATE_OWNED_ENTERPRISE: <Building2 className="h-3.5 w-3.5" />,
  LAW_OR_POLICY: <Clock className="h-3.5 w-3.5" />,
  MEDIA_OR_PUBLICATION: <SdIcon className="h-3.5 w-3.5" />,
  TOPIC: <Clock className="h-3.5 w-3.5" />,
  RISK: <Clock className="h-3.5 w-3.5" />,
  OPPORTUNITY: <Clock className="h-3.5 w-3.5" />,
  PROJECT: <Building2 className="h-3.5 w-3.5" />,
};

// ── Role label colour groups ──────────────────────────────────────────────────

/**
 * Returns a Tailwind className for the role label text.
 * Anchors get a subtle blue tint; extracted get muted; mentioned get dimmer.
 */
function roleLabelClass(roleLabel: string): string {
  switch (roleLabel) {
    case "Interviewee":
    case "Participant":
      return "text-[#8EB6F3]"; // blue — same as the Relationships icon accent
    case "Organization":
    case "Primary Subject":
    case "Author":
      return "text-violet-400/80";
    case "Extracted":
      return "text-muted-foreground";
    case "Mentioned":
      return "text-muted-foreground/60";
    default:
      return "text-muted-foreground";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type SourceEntityListProps = {
  items: SourceEntityItem[];
};

export function SourceEntityList({ items }: SourceEntityListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No entities linked yet.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div
          key={item.entityId}
          className="group flex items-start gap-2 rounded-[5px] px-1.5 py-1.5 transition-colors duration-150 hover:bg-accent"
        >
          {/* Type icon */}
          <div className="mt-[2px] shrink-0 text-muted-foreground">
            {ENTITY_ICON[item.type] ?? <SdIcon className="h-3.5 w-3.5" />}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            {/* Name */}
            <p
              className="truncate text-[12.5px] font-medium leading-tight text-foreground"
              title={item.name}
            >
              {item.name}
            </p>

            {/* Context (preferred) or description (fallback) */}
            {(item.context || item.description) && (
              <p
                className="mt-[2px] line-clamp-2 text-[11px] leading-snug text-muted-foreground"
                title={item.context ?? item.description ?? undefined}
              >
                {item.context ?? item.description}
              </p>
            )}

            {/* Type badge + role label */}
            <div className="mt-[3px] flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="h-[16px] rounded-[3px] px-1 py-0 text-[9.5px] font-medium uppercase leading-none"
                style={{ letterSpacing: "0.04em" }}
              >
                {item.type.replace(/_/g, " ")}
              </Badge>
              <span
                className={`text-[10px] leading-none ${roleLabelClass(item.roleLabel)}`}
              >
                {item.roleLabel}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
