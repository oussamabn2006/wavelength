import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useSession } from '../stores/sessionStore'
import { chart, tooltipProps } from '../lib/chart'
import type { HistoryItem } from '../types'

async function loadHistory(userId: number): Promise<HistoryItem[]> {
  try {
    return await api.history(userId, 500)
  } catch {
    return api.history(userId, 100) // the API may cap the page size
  }
}

function count<T>(items: T[], key: (x: T) => string[]): [string, number][] {
  const m = new Map<string, number>()
  for (const it of items) for (const k of key(it)) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${tone} p-5`}>
      <div className="text-xs font-bold uppercase tracking-wider text-white/80">{label}</div>
      <div className="mt-2 text-4xl font-black tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-sm text-white/80">{sub}</div>}
    </div>
  )
}

export function StatsPage() {
  const userId = useSession((s) => s.userId)
  const q = useQuery({ queryKey: ['stats-history', userId], queryFn: () => loadHistory(userId), staleTime: 60_000 })
  const h = q.data ?? []

  const minutes = Math.round(h.reduce((a, x) => a + x.ms_played, 0) / 60000)
  const artists = count(h, (x) => x.artist_names.split(',').map((s) => s.trim()).filter(Boolean))
  const tracks = count(h, (x) => [`${x.track_id}|${x.track_title}|${x.artist_names}`])
  const hours = Array.from({ length: 24 }, (_, i) => ({ label: `${i}h`, value: 0 }))
  const days = DAYS.map((label) => ({ label, value: 0 }))
  for (const x of h) {
    const d = new Date(x.played_at)
    hours[d.getHours()].value++
    days[d.getDay()].value++
  }
  const peak = hours.reduce((a, b) => (b.value > a.value ? b : a), hours[0])
  const topDay = days.reduce((a, b) => (b.value > a.value ? b : a), days[0])

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold">Your stats</h1>
      <p className="mb-6 text-sm text-muted">Based on your last {h.length} plays.</p>

      {q.isLoading && <p className="text-muted">Loading...</p>}
      {q.isError && <p className="text-muted">Could not load your stats.</p>}
      {q.isSuccess && h.length === 0 && <p className="text-muted">Play some songs and your stats will appear here.</p>}

      {h.length > 0 && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Big label="Minutes listened" value={minutes.toLocaleString()} sub={`${(minutes / 60).toFixed(1)} hours`} tone="from-fuchsia-600 to-purple-800" />
            <Big label="Songs played" value={h.length.toLocaleString()} sub={`${tracks.length} different songs`} tone="from-emerald-600 to-teal-800" />
            <Big label="Artists" value={artists.length.toLocaleString()} sub={artists[0] ? `Top: ${artists[0][0]}` : undefined} tone="from-orange-500 to-red-700" />
            <Big label="Peak hour" value={`${peak.label.replace('h', '')}:00`} sub={`Most active on ${topDay.label}`} tone="from-sky-500 to-indigo-800" />
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-2xl font-bold">Top artists</h2>
              <ol className="space-y-1">
                {artists.slice(0, 5).map(([name, n], i) => (
                  <li key={name} className="flex items-center gap-4 rounded-md px-3 py-2 hover:bg-white/10">
                    <span className="w-6 text-lg font-bold text-muted">{i + 1}</span>
                    <span className="flex-1 truncate font-semibold">{name}</span>
                    <span className="text-sm tabular-nums text-muted">{n} plays</span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2 className="mb-3 text-2xl font-bold">Top songs</h2>
              <ol className="space-y-1">
                {tracks.slice(0, 5).map(([key, n], i) => {
                  const [, title, by] = key.split('|')
                  return (
                    <li key={key} className="flex items-center gap-4 rounded-md px-3 py-2 hover:bg-white/10">
                      <span className="w-6 text-lg font-bold text-muted">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{title}</span>
                        <span className="block truncate text-sm text-muted">{by}</span>
                      </span>
                      <span className="text-sm tabular-nums text-muted">{n} plays</span>
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg bg-surface p-5">
              <h2 className="mb-3 text-lg font-bold">When you listen</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hours}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={chart.axis} tick={{ fontSize: 11 }} interval={2} />
                  <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipProps} formatter={(v: unknown) => [`${Number(v)} plays`, '']} />
                  <Bar dataKey="value" fill={chart.accent} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
            <section className="rounded-lg bg-surface p-5">
              <h2 className="mb-3 text-lg font-bold">Your week</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={days}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={chart.axis} tick={{ fontSize: 11 }} />
                  <YAxis stroke={chart.axis} tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipProps} formatter={(v: unknown) => [`${Number(v)} plays`, '']} />
                  <Bar dataKey="value" fill={chart.blue} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>
          <p className="mt-6 text-sm text-muted">See what is popular with everyone on <Link to="/charts" className="underline hover:text-white">Charts</Link>.</p>
        </>
      )}
    </div>
  )
}
