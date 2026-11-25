import { TrackRow } from '../components/music/TrackRow'
import { usePlayer } from '../stores/playerStore'

export function QueuePage() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const current = queue[index]
  const next = queue.slice(index + 1)

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Queue</h1>
      {!current && <p className="text-muted">Nothing is playing. Start a song and it will show up here.</p>}
      {current && (
        <>
          <h2 className="mb-2 text-lg font-bold">Now playing</h2>
          <TrackRow track={current} index={index} queue={queue} />
          <h2 className="mb-2 mt-6 text-lg font-bold">Next up</h2>
          {next.length === 0 && <p className="text-sm text-muted">The queue ends here.</p>}
          {next.map((t, i) => <TrackRow key={`${t.track_id}-${i}`} track={t} index={index + 1 + i} queue={queue} />)}
        </>
      )}
    </div>
  )
}
