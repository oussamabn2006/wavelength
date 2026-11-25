import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Cover } from '../components/common/Cover'
import { ErrorState } from '../components/common/States'
import { Hero } from '../components/music/Hero'
import { PlayButton } from '../components/music/PlayButton'
import { TrackRow } from '../components/music/TrackRow'
import { formatDuration } from '../lib/format'
import { albumToTracks, yearOf } from '../lib/tracks'
import { api } from '../services/api'
import { usePlayer } from '../stores/playerStore'

export function AlbumPage() {
  const albumId = Number(useParams().id)
  const playQueue = usePlayer((s) => s.playQueue)
  const q = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => api.getAlbum(albumId),
    enabled: Number.isFinite(albumId),
  })

  if (q.isLoading) return <p className="text-muted">Loading album...</p>
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message ?? 'Album not found'} onRetry={() => q.refetch()} />
  }

  const a = q.data
  const tracks = albumToTracks(a)
  const total = tracks.reduce((sum, t) => sum + t.duration_ms, 0)

  return (
    <div>
      <Hero kind={a.album_type} title={a.title} cover={<Cover albumId={a.album_id} seed={a.album_id} />}>
        {a.artists.map((ar, i) => (
          <span key={ar.artist_id}>
            {i > 0 && ', '}
            <Link to={`/artist/${ar.artist_id}`} className="font-bold text-white hover:underline">
              {ar.name}
            </Link>
          </span>
        ))}
        {a.artists.length > 0 && ' · '}
        {yearOf(a.release_date)} · {tracks.length} songs, {formatDuration(total)}
      </Hero>

      <div className="mb-4 py-2">
        <PlayButton onClick={() => playQueue(tracks, 0, true)} label="Play album" />
      </div>

      <div>
        {tracks.map((t, i) => (
          <TrackRow key={t.track_id} track={t} index={i} queue={tracks} />
        ))}
      </div>
    </div>
  )
}