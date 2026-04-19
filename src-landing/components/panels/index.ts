/**
 * Sovereign Panel Primitives — barrel file.
 *
 * Recommended usage in a target app:
 *
 *   import { PanelShell, WindowChrome, PanelHeader, MetricCard }
 *     from "@/components/panels"
 *
 * These primitives encode the entire visual language of the landing-page
 * panels. Always prefer composing them over rolling your own; it is the
 * simplest way to keep visual fidelity high across the real product.
 */

export { PanelShell, type PanelShellProps } from "./PanelShell"
export {
  WindowChrome,
  StatusPill,
  type WindowChromeProps,
  type ChromeDensity,
} from "./WindowChrome"
export { PanelHeader, type PanelHeaderProps } from "./PanelHeader"
export { MetricCard, type MetricCardProps } from "./MetricCard"
export { SectionChip, type SectionChipProps, type ChipTone } from "./SectionChip"
export {
  AppSurface,
  NavSection,
  type AppSurfaceProps,
  type NavSectionProps,
  type SidebarNavItem,
} from "./AppSurface"
export { WindowPanel, type WindowPanelProps } from "./WindowPanel"
export { ListRow, IconWell, type ListRowProps } from "./ListRow"
export { InsightCard, type InsightCardProps } from "./InsightCard"
