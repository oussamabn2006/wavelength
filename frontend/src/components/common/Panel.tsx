import type { ReactNode } from 'react'
import { fmtMs } from '../../lib/ui'

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
    </div>
  )
}

interface PanelProps {
  title: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, hint, actions, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-lg bg-surface p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {hint && <p className="mt-0.5 max-w-2xl text-xs text-muted">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

const BADGE: Record<string, string> = {
  HIT: 'bg-accent/20 text-accent',
  MISS: 'bg-amber-400/20 text-amber-300',
  BYPASS: 'bg-sky-400/20 text-sky-300',
  DOWN: 'bg-red-500/20 text-red-300',
}

export function CacheBadge({ cache, ms }: { cache: string | null; ms: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className={`rounded px-2 py-0.5 font-bold ${BADGE[cache ?? ''] ?? 'bg-white/10 text-muted'}`}>
        X-Cache: {cache ?? 'n/a'}
      </span>
      <span className="tabular-nums text-muted">{fmtMs(ms)}</span>
    </span>
  )
}

const TONES = {
  ok: 'bg-accent/20 text-accent',
  warn: 'bg-amber-400/20 text-amber-300',
  bad: 'bg-red-500/20 text-red-300',
  muted: 'bg-white/10 text-muted',
} as const

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>
}
