import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { usePlayer } from '../stores/playerStore'
import type { TopArtist, TopTrack } from '../types'

interface Chart { month: string; tracks: TopTrack[]; artists: TopArtist[] }

async function load(): Promise<Chart> {
  const now = new Date()
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const [tracks, artists] = await Promise.all([api.topTracks(month, 50), api.topArtists(month, 20)])
    if (tracks.length > 0 || artists.length > 0) return { month, tracks, artists }
  }
  return { month: '', tracks: [], artists: [] }
}

export function ChartsPage() {
  const playQueue = usePlayer((s) => s.playQueue)
  const q = useQuery({ queryKey: ['charts'], queryFn: load, staleTime: 300_000 })
  const label = q.data?.month ? new Date(q.data.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''

  return (
    <div>
      <div className="mb-6 rounded-lg bg-gradient-to-b from-emerald-700/60 to-transparent p-6">
        <div className="text-xs font-bold uppercase">Charts</div>
        <h1 className="text-5xl font-black">Top 50</h1>
        <p className="mt-2 text-sm text-muted">The most played songs on the platform{label && ` in ${label}`}.</p>
      </div>

      {q.isLoading && <p className="text-muted">Loading...</p>}
      {q.isError && <p className="text-muted">Charts are unavailable right now.</p>}
      {q.isSuccess && q.data.tracks.length === 0 && <p className="text-muted">No chart data yet.</p>}

      <ol className="mb-10">
        {q.data?.tracks.map((t, i) => (
          <li key={t.track_id}>
            <button type="button"
              onClick={() => void api.getTrack(t.track_id).then((tr) => playQueue([tr], 0)).catch(() => {})}
              className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-4 rounded-md px-3 py-2 text-left hover:bg-white/10">
              <span className="text-lg font-bold text-muted group-hover:hidden">{i + 1}</span>
              <span className="hidden group-hover:block"><Play size={18} fill="currentColor" /></span>
              <span className="truncate font-semibold">{t.title}</span>
              <span className="text-sm tabular-nums text-muted">{t.play_count.toLocaleString()} plays</span>
            </button>
          </li>
        ))}
      </ol>

      {(q.data?.artists.length ?? 0) > 0 && (
        <>
          <h2 className="mb-3 text-2xl font-bold">Top artists</h2>
          <ol>
            {q.data!.artists.map((a, i) => (
              <li key={a.artist_id}>
                <Link to={`/artist/${a.artist_id}`} className="grid grid-cols-[3rem_1fr_auto] items-center gap-4 rounded-md px-3 py-2 hover:bg-white/10">
                  <span className="text-lg font-bold text-muted">{i + 1}</span>
                  <span className="truncate font-semibold">{a.name}</span>
                  <span className="text-sm tabular-nums text-muted">{a.play_count.toLocaleString()} plays</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
