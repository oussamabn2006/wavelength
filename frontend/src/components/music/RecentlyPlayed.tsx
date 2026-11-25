import { useQuery } from '@tanstack/react-query'
import { Cover } from '../common/Cover'
import { api } from '../../services/api'
import { usePlayer } from '../../stores/playerStore'
import { useSession } from '../../stores/sessionStore'

/** A row of cards with the last distinct tracks the user played. Renders nothing when there is no history. */
export function RecentlyPlayed() {
  const userId = useSession((s) => s.userId)
  const playQueue = usePlayer((s) => s.playQueue)
  const q = useQuery({ queryKey: ['recent', userId], queryFn: () => api.history(userId, 40) })

  const seen = new Set<number>()
  const items = (q.data ?? []).filter((h) => (seen.has(h.track_id) ? false : (seen.add(h.track_id), true))).slice(0, 6)
  if (items.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-2xl font-bold">Recently played</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((h) => (
          <button
            key={h.track_id}
            type="button"
            onClick={() => void api.getTrack(h.track_id).then((t) => playQueue([t], 0)).catch(() => {})}
            className="rounded-lg bg-surface p-3 text-left transition hover:bg-surface-2"
          >
            <Cover seed={h.track_id} />
            <div className="mt-3 truncate font-bold">{h.track_title}</div>
            <div className="truncate text-sm text-muted">{h.artist_names}</div>
          </button>
        ))}
      </div>
    </section>
  )
}
