import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/header"
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  Mic,
  Tag,
  Users,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Capture & Organise — Sovereign",
  description:
    "Bring every conversation, report, and recording into one connected working memory. Sovereign turns raw material into reusable organisational knowledge.",
}

const GRAIN_BG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)'/%3E%3C/svg%3E\")"

const DOT_GRID =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='0.5' cy='0.5' r='0.75' fill='white'/%3E%3C/svg%3E\")"

// ─── Shared panel token colours ───────────────────────────────────────────────
const PANEL_BG      = "#070E1F"
const PANEL_BORDER  = "rgba(147,147,147,0.16)"
const DIVIDER       = "rgba(147,147,147,0.10)"
const TEXT_PRIMARY  = "rgba(255,255,255,0.88)"
const TEXT_MUTED    = "rgba(255,255,255,0.40)"
const TEXT_DIM      = "rgba(255,255,255,0.22)"
const ACCENT_BLUE   = "#5B9CF6"
const ACCENT_GREEN  = "#4ADE80"
const ACCENT_AMBER  = "#FBBF24"

// ─── Mock data ────────────────────────────────────────────────────────────────
const UTTERANCES = [
  {
    speaker: "Matilda Rojas",
    time: "0:00 – 0:20",
    text: "Mr. Green, thank you for receiving us in Abuja. Nigeria's energy sector feels like it is entering another defining phase — reforms under the Petroleum Industry Act, a stronger push on gas, the rise of domestic refining. From your perspective, what defines this moment?",
  },
  {
    speaker: "Mr. Green",
    time: "0:21 – 0:54",
    text: "I would define this moment with one word: execution. Nigeria has never lacked resource potential. What has often been missing is the ability to convert that potential into stable output, reliable domestic supply, and investor confidence. Today the focus is much less on theory and much more on delivery.",
    highlighted: true,
  },
  {
    speaker: "Matilda Rojas",
    time: "0:54 – 1:09",
    text: "Reuters reported that NNPC will begin exporting a new light crude grade. What does that signal to the market?",
  },
]

const ENTITIES = [
  { name: "NNPC Ltd.", type: "Organisation", color: ACCENT_BLUE },
  { name: "Nigeria", type: "Government", color: "#A78BFA" },
  { name: "Mr. Green", type: "Person", color: ACCENT_BLUE },
  { name: "Petroleum Industry Act", type: "Policy", color: ACCENT_AMBER },
  { name: "Niger Delta", type: "Location", color: "#34D399" },
  { name: "Abuja", type: "Location", color: "#34D399" },
]

const SOURCE_TYPES = [
  { icon: Mic,      label: "Audio recording",  sub: "MP3, M4A, WAV, WebM" },
  { icon: FileText, label: "PDF transcript",   sub: "Structured or scanned" },
  { icon: FileText, label: "Written report",   sub: "Word, PDF, plain text" },
  { icon: Users,    label: "Meeting notes",    sub: "Paste or upload" },
]

const BENEFITS = [
  {
    title: "Bring every conversation into one working memory",
    body: "Meetings, field recordings, written reports, and expert interviews — all structured, searchable, and connected to everything else your team already knows.",
  },
  {
    title: "Preserve what matters before it gets lost",
    body: "Critical context rarely survives in email threads or personal notes. Sovereign captures it at the source and keeps it available for whoever needs it next.",
  },
  {
    title: "Review with confidence when the details matter",
    body: "When precision is important, Sovereign makes it easy to verify and refine what has been captured — so your team can trust what they're working with.",
  },
  {
    title: "Turn raw material into connected context",
    body: "Every source you bring in becomes part of a growing organisational memory — linked to the people, organisations, and themes that already exist in your system.",
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelChrome({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        boxShadow: "0 24px 80px -16px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.03) inset",
      }}
    >
      {children}
    </div>
  )
}

function PanelHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      className="px-5 py-3.5"
      style={{ borderBottom: `1px solid ${DIVIDER}` }}
    >
      <p className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>{title}</p>
      {sub && <p className="mt-0.5 text-[9px]" style={{ color: TEXT_MUTED }}>{sub}</p>}
    </div>
  )
}

// ─── Upload panel ─────────────────────────────────────────────────────────────
function UploadPanel() {
  return (
    <PanelChrome>
      <PanelHeader title="Add a source" sub="Upload a recording, transcript, or written document" />

      {/* Source type selector */}
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {SOURCE_TYPES.map(({ icon: Icon, label, sub }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-center"
            style={{
              background: label === "Audio recording" ? "rgba(91,156,246,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${label === "Audio recording" ? "rgba(91,156,246,0.28)" : DIVIDER}`,
            }}
          >
            <Icon
              className="h-4 w-4"
              style={{ color: label === "Audio recording" ? ACCENT_BLUE : TEXT_MUTED }}
              strokeWidth={1.5}
            />
            <div>
              <p className="text-[10px] font-medium" style={{ color: label === "Audio recording" ? TEXT_PRIMARY : TEXT_MUTED }}>
                {label}
              </p>
              <p className="mt-0.5 text-[8.5px]" style={{ color: TEXT_DIM }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div className="mx-4 mb-4">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-8"
          style={{ border: `1.5px dashed rgba(91,156,246,0.25)`, background: "rgba(91,156,246,0.03)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "rgba(91,156,246,0.10)", border: "1px solid rgba(91,156,246,0.22)" }}
          >
            <Archive className="h-4 w-4" style={{ color: ACCENT_BLUE }} strokeWidth={1.5} />
          </div>
          <p className="text-[11px] font-medium" style={{ color: TEXT_PRIMARY }}>Drop file here or click to browse</p>
          <p className="text-[9.5px]" style={{ color: TEXT_DIM }}>MP3, M4A, WAV, PDF, DOCX — max 500 MB</p>
        </div>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {[
          { label: "Source title", placeholder: "e.g. Minister of Energy — Abuja, Feb 2026" },
          { label: "Project", placeholder: "Nigeria 2026 — Select project" },
          { label: "Subject name", placeholder: "e.g. Mr. Green" },
          { label: "Organisation", placeholder: "e.g. NNPC Ltd." },
        ].map(({ label, placeholder }) => (
          <div key={label}>
            <p className="mb-1 text-[9px] font-medium" style={{ color: TEXT_MUTED }}>{label}</p>
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${DIVIDER}` }}
            >
              <p className="text-[10px]" style={{ color: TEXT_DIM }}>{placeholder}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-3"
        style={{ borderTop: `1px solid ${DIVIDER}` }}
      >
        <div
          className="rounded-lg px-4 py-1.5 text-[10px] font-medium"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${DIVIDER}`, color: TEXT_MUTED }}
        >
          Cancel
        </div>
        <div
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[10px] font-semibold"
          style={{ background: ACCENT_BLUE, color: "#060D1C" }}
        >
          <Archive className="h-3 w-3" strokeWidth={2} />
          Capture & process
        </div>
      </div>
    </PanelChrome>
  )
}

// ─── Transcript review panel ──────────────────────────────────────────────────
function TranscriptPanel() {
  return (
    <PanelChrome>
      <PanelHeader
        title="Transcript review"
        sub="Nigeria 1 — NNPC — Mr. Green  ·  Review status: draft"
      />

      {/* Search bar */}
      <div className="px-4 pt-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${DIVIDER}` }}
        >
          <svg className="h-3 w-3 shrink-0" style={{ color: TEXT_DIM }} fill="none" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-[10px]" style={{ color: TEXT_DIM }}>Find in transcript…</p>
        </div>
      </div>

      {/* Utterances */}
      <div className="space-y-2 p-4">
        {UTTERANCES.map(({ speaker, time, text, highlighted }) => (
          <div
            key={time}
            className="rounded-xl p-3"
            style={{
              background: highlighted ? "rgba(91,156,246,0.05)" : "rgba(255,255,255,0.025)",
              border: `1px solid ${highlighted ? "rgba(91,156,246,0.18)" : DIVIDER}`,
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[9.5px] font-semibold" style={{ color: highlighted ? ACCENT_BLUE : TEXT_PRIMARY }}>
                {speaker}
              </p>
              <p className="text-[8.5px]" style={{ color: TEXT_DIM }}>{time}</p>
              {highlighted && (
                <div
                  className="ml-auto rounded-full px-2 py-0.5 text-[8px] font-medium"
                  style={{ background: "rgba(91,156,246,0.14)", color: ACCENT_BLUE }}
                >
                  Key passage
                </div>
              )}
            </div>
            {/* Simulated audio scrubber */}
            <div className="mb-2.5 flex items-center gap-2">
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${DIVIDER}` }}
              >
                <svg className="h-2 w-2" viewBox="0 0 8 8" fill="currentColor" style={{ color: TEXT_MUTED }}>
                  <path d="M2 1.5l4 2.5-4 2.5V1.5z" />
                </svg>
              </div>
              <div className="relative flex-1 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: highlighted ? "42%" : "18%", background: ACCENT_AMBER }}
                />
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2"
                  style={{
                    left: highlighted ? "calc(42% - 5px)" : "calc(18% - 5px)",
                    background: ACCENT_AMBER,
                    borderColor: PANEL_BG,
                  }}
                />
              </div>
            </div>
            <p className="text-[10px] leading-[1.65]" style={{ color: TEXT_MUTED }}>{text}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderTop: `1px solid ${DIVIDER}` }}
      >
        <div
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9.5px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${DIVIDER}`, color: TEXT_MUTED }}
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 8h6M5 5.5h4M5 10.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Save draft
        </div>
        <div
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9.5px] font-semibold"
          style={{ background: ACCENT_GREEN, color: "#060D1C" }}
        >
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
          Mark as reviewed
        </div>
      </div>
    </PanelChrome>
  )
}

// ─── Entities panel ───────────────────────────────────────────────────────────
function EntitiesPanel() {
  return (
    <PanelChrome>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
        <div>
          <p className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>Recognised context</p>
          <p className="mt-0.5 text-[9px]" style={{ color: TEXT_MUTED }}>People, organisations, and themes identified in this source</p>
        </div>
        <div
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${DIVIDER}`, color: TEXT_MUTED }}
        >
          <Tag className="h-2.5 w-2.5" strokeWidth={1.5} />
          Link existing
        </div>
      </div>

      <div className="p-4">
        <div className="space-y-1.5">
          {ENTITIES.map(({ name, type, color }) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${DIVIDER}` }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                <p className="text-[10.5px] font-medium" style={{ color: TEXT_PRIMARY }}>{name}</p>
              </div>
              <div className="flex items-center gap-2">
                <p
                  className="rounded-full px-2 py-0.5 text-[8px] font-medium uppercase tracking-[0.06em]"
                  style={{ background: `${color}18`, color: color }}
                >
                  {type}
                </p>
                <ChevronRight className="h-3 w-3" style={{ color: TEXT_DIM }} strokeWidth={1.5} />
              </div>
            </div>
          ))}
        </div>

        {/* Connection hint */}
        <div
          className="mt-3 flex items-start gap-2.5 rounded-xl p-3"
          style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.14)" }}
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: ACCENT_GREEN }} strokeWidth={2} />
          <p className="text-[10px] leading-[1.6]" style={{ color: "rgba(74,222,128,0.80)" }}>
            3 entities linked to existing records in your workspace. Context from 4 prior sources has been connected automatically.
          </p>
        </div>
      </div>
    </PanelChrome>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaptureOrganisePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#060D1C" }}>
      <Header />

      {/* Textures */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: GRAIN_BG, backgroundRepeat: "repeat", backgroundSize: "300px 300px", opacity: 0.035 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: DOT_GRID, backgroundRepeat: "repeat", backgroundSize: "24px 24px", opacity: 0.022 }}
      />

      <main className="relative z-10 overflow-x-hidden">

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 120% 55% at 50% -5%, rgba(10,24,56,0.90) 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-32 md:pb-24 md:pt-40">
            {/* Breadcrumb */}
            <div className="mb-8 flex items-center gap-2">
              <Link
                href="/"
                className="text-[11px] font-medium uppercase tracking-[0.10em] transition-opacity hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                Platform
              </Link>
              <ChevronRight className="h-3 w-3" style={{ color: "rgba(255,255,255,0.18)" }} strokeWidth={1.5} />
              <p className="text-[11px] font-medium uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>
                Capture &amp; Organise
              </p>
            </div>

            {/* Eyebrow */}
            <div className="mb-5 flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: "rgba(91,156,246,0.10)", border: "1px solid rgba(91,156,246,0.22)" }}
              >
                <Archive className="h-3.5 w-3.5" style={{ color: ACCENT_BLUE }} strokeWidth={1.5} />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                Capture &amp; Organise
              </p>
            </div>

            {/* Headline + lead */}
            <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-[3fr_2fr] lg:gap-20">
              <h1 className="font-serif text-4xl font-normal leading-[1.06] tracking-[-0.030em] text-white md:text-5xl lg:text-[3.2rem]">
                Everything your team knows,
                <br />
                in one place that works.
              </h1>
              <p
                className="text-pretty text-[15px] leading-[1.80] tracking-[-0.011em] lg:pb-1"
                style={{ color: "rgba(255,255,255,0.50)" }}
              >
                Sovereign brings recordings, reports, and conversations into a single connected system — so nothing important gets left behind, and everything becomes easier to find, use, and build on.
              </p>
            </div>

            <div aria-hidden="true" className="mt-14 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
        </section>

        {/* ── STEP 1 — CAPTURE ──────────────────────────────────────────────── */}
        <section className="relative border-t border-white/[0.06]" style={{ background: "#060D1C" }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(6,16,52,0.70) 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-0 md:pt-28">
            {/* Copy row */}
            <div className="mb-14 grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] lg:gap-20">
              <div>
                <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                  01 — Bring it in
                </p>
                <h2 className="font-serif text-3xl font-normal leading-[1.10] tracking-[-0.025em] text-white md:text-4xl">
                  Every format your team works with.
                </h2>
              </div>
              <p className="text-[15px] leading-[1.80] tracking-[-0.011em] lg:pt-10" style={{ color: "rgba(255,255,255,0.48)" }}>
                Audio recordings, PDF reports, written transcripts, meeting notes — Sovereign accepts the formats your team already produces. No reformatting required before the value starts.
              </p>
            </div>
          </div>

          {/* Upload panel — full width within max container */}
          <div className="relative mx-auto max-w-5xl px-6 pb-24">
            <UploadPanel />
          </div>
        </section>

        {/* ── STEP 2 — REVIEW ───────────────────────────────────────────────── */}
        <section className="relative border-t border-white/[0.06]" style={{ background: "#060D1C" }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(6,14,46,0.65) 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-5xl px-6 pt-20 md:pt-28">
            <div className="mb-14 grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] lg:gap-20">
              <div>
                <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                  02 — Review &amp; refine
                </p>
                <h2 className="font-serif text-3xl font-normal leading-[1.10] tracking-[-0.025em] text-white md:text-4xl">
                  Precision where it matters most.
                </h2>
              </div>
              <p className="text-[15px] leading-[1.80] tracking-[-0.011em] lg:pt-10" style={{ color: "rgba(255,255,255,0.48)" }}>
                Sovereign is designed to preserve nuance. When the details matter, the platform gives your team a clear, fast way to verify what has been captured — so you can trust what you're working with.
              </p>
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl px-6 pb-24">
            <TranscriptPanel />
          </div>
        </section>

        {/* ── STEP 3 — CONNECT ──────────────────────────────────────────────── */}
        <section className="relative border-t border-white/[0.06]" style={{ background: "#060D1C" }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(6,16,48,0.65) 0%, transparent 60%)",
            }}
          />

          <div className="relative mx-auto max-w-5xl px-6 pt-20 md:pt-28">
            <div className="mb-14 grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr] lg:gap-20">
              <div>
                <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
                  03 — Connect &amp; link
                </p>
                <h2 className="font-serif text-3xl font-normal leading-[1.10] tracking-[-0.025em] text-white md:text-4xl">
                  New information, connected to everything.
                </h2>
              </div>
              <p className="text-[15px] leading-[1.80] tracking-[-0.011em] lg:pt-10" style={{ color: "rgba(255,255,255,0.48)" }}>
                Every source you add becomes part of a growing organisational memory. People, organisations, and themes are recognised and linked to what your team already knows — so context compounds over time.
              </p>
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl px-6 pb-24">
            <EntitiesPanel />
          </div>
        </section>

        {/* ── BENEFITS GRID ─────────────────────────────────────────────────── */}
        <section className="relative border-t border-white/[0.06]" style={{ background: "#060D1C" }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(6,14,44,0.60) 0%, transparent 65%)",
            }}
          />
          {/* Local dot field */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='0.5' cy='0.5' r='0.9' fill='white' fill-opacity='1'/%3E%3C/svg%3E\")",
              backgroundRepeat: "repeat",
              backgroundSize: "20px 20px",
              opacity: 0.06,
            }}
          />

          <div className="relative mx-auto max-w-5xl px-6 py-20 md:py-28">
            <p className="mb-12 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.28)" }}>
              Why it matters
            </p>

            <div className="grid grid-cols-1 gap-px sm:grid-cols-2" style={{ background: "rgba(255,255,255,0.06)" }}>
              {BENEFITS.map(({ title, body }) => (
                <div
                  key={title}
                  className="p-8"
                  style={{ background: "#060D1C" }}
                >
                  <h3 className="mb-3 font-serif text-[18px] font-normal leading-[1.22] tracking-[-0.018em] text-white">
                    {title}
                  </h3>
                  <p className="text-[14px] leading-[1.80] tracking-[-0.010em]" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA STRIP ─────────────────────────────────────────────────────── */}
        <section className="relative border-t border-white/[0.06]" style={{ background: "#060D1C" }}>
          <div className="relative mx-auto max-w-5xl px-6 py-20 md:py-24">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-normal leading-[1.14] tracking-[-0.022em] text-white md:text-3xl">
                  Ready to put your knowledge to work?
                </h2>
                <p className="mt-2 text-[14px] leading-[1.70] tracking-[-0.010em]" style={{ color: "rgba(255,255,255,0.42)" }}>
                  See how Sovereign captures and connects what your team already knows.
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Link
                  href="/request-demo"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium tracking-[-0.011em] text-[#070E1F] transition-opacity hover:opacity-90"
                >
                  Request a demo
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium tracking-[-0.011em] transition-colors hover:bg-white/[0.06]"
                  style={{ border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.60)" }}
                >
                  Explore the platform
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER NAV ────────────────────────────────────────────────────── */}
        <footer
          className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-8"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <Link
            href="/"
            className="text-[12px] tracking-[-0.011em] transition-opacity hover:opacity-60"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            ← Back to Sovereign
          </Link>
          <Link
            href="/request-demo"
            className="text-[12px] font-medium tracking-[-0.011em] transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            Request a demo →
          </Link>
        </footer>
      </main>
    </div>
  )
}