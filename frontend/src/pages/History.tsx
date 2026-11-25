import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Cover } from '../components/common/Cover'
import { api } from '../services/api'
import { usePlayer } from '../stores/playerStore'
import { useSession } from '../stores/sessionStore'
import type { HistoryItem } from '../types'

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(new Date()) - start(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function HistoryPage() {
  const userId = useSession((s) => s.userId)
  const playQueue = usePlayer((s) => s.playQueue)
  const current = usePlayer((s) => s.current)

  const q = useQuery({ queryKey: ['history-page', userId], queryFn: () => api.history(userId, 100), staleTime: 0 })

  const playAgain = async (h: HistoryItem) => {
    try {
      playQueue([await api.getTrack(h.track_id)], 0)
    } catch {
      /* track no longer available */
    }
  }

  const groups: { label: string; items: HistoryItem[] }[] = []
  for (const h of q.data ?? []) {
    const label = dayLabel(h.played_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(h)
    else groups.push({ label, items: [h] })
  }

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold">Listening history</h1>
      <p className="mb-6 text-sm text-muted">Songs you played recently.</p>

      {q.isLoading && <p className="text-muted">Loading...</p>}
      {q.isError && <p className="text-muted">Could not load your history.</p>}
      {q.data?.length === 0 && (
        <div className="rounded-lg bg-surface p-8 text-center">
          <p className="text-lg font-bold">Nothing played yet</p>
          <p className="mt-1 text-sm text-muted">Songs you listen to will show up here.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{g.label}</h2>
          <ul>
            {g.items.map((h) => (
              <li key={h.event_id}>
                <button
                  type="button"
                  onClick={() => void playAgain(h)}
                  className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-md px-2 py-2 text-left hover:bg-white/10 md:grid-cols-[auto_2fr_1.5fr_auto_auto]"
                >
                  <span className="relative block h-11 w-11 shrink-0">
                    <Cover seed={h.track_id} small />
                    <span className="absolute inset-0 hidden items-center justify-center rounded bg-black/60 group-hover:flex">
                      <Play size={18} fill="currentColor" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate font-semibold ${current?.track_id === h.track_id ? 'text-accent' : ''}`}>{h.track_title}</span>
                    <span className="block truncate text-sm text-muted">{h.artist_names}</span>
                  </span>
                  <span className="hidden truncate text-sm text-muted md:block">{h.album_title}</span>
                  <span className="text-sm tabular-nums text-muted">{timeOf(h.played_at)}</span>
                  <span className="hidden text-sm tabular-nums text-muted md:block">{mmss(h.duration_ms)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
