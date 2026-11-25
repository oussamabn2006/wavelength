import { Heart, Play } from 'lucide-react'
import { TrackRow } from '../components/music/TrackRow'
import { useLikes } from '../stores/likeStore'
import { usePlayer } from '../stores/playerStore'
import { useSession } from '../stores/sessionStore'

export function LikedPage() {
  const userId = useSession((s) => s.userId)
  const tracks = useLikes((s) => s.liked[userId]) ?? []
  const playQueue = usePlayer((s) => s.playQueue)

  return (
    <div>
      <div className="mb-6 flex items-end gap-6 rounded-lg bg-gradient-to-b from-indigo-700/60 to-transparent p-6">
        <div className="flex h-44 w-44 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-300 shadow-xl">
          <Heart size={72} fill="white" className="text-white" />
        </div>
        <div>
          <div className="text-xs font-bold uppercase">Playlist</div>
          <h1 className="text-5xl font-black">Liked Songs</h1>
          <p className="mt-2 text-sm text-muted">{tracks.length} song{tracks.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      {tracks.length > 0 && (
        <button type="button" aria-label="Play liked songs" onClick={() => playQueue(tracks, 0)}
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black transition hover:scale-105 hover:bg-accent-2">
          <Play fill="currentColor" />
        </button>
      )}
      {tracks.length === 0 && <p className="text-muted">Songs you like with the heart icon will appear here.</p>}
      {tracks.map((t, i) => <TrackRow key={t.track_id} track={t} index={i} queue={tracks} />)}
    </div>
  )
}
