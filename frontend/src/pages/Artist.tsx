import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Cover } from '../components/common/Cover'
import { CardGrid, Section } from '../components/common/Section'
import { ErrorState } from '../components/common/States'
import { Hero } from '../components/music/Hero'
import { MediaCard } from '../components/music/MediaCard'
import { PlayButton } from '../components/music/PlayButton'
import { albumToTracks, yearOf } from '../lib/tracks'
import { api } from '../services/api'
import { usePlayer } from '../stores/playerStore'
import { useToasts } from '../stores/toastStore'

export function ArtistPage() {
  const artistId = Number(useParams().id)
  const playQueue = usePlayer((s) => s.playQueue)
  const push = useToasts((s) => s.push)
  const [busy, setBusy] = useState(false)
  const q = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => api.getArtist(artistId),
    enabled: Number.isFinite(artistId),
  })

  if (q.isLoading) return <p className="text-muted">Loading artist...</p>
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message ?? 'Artist not found'} onRetry={() => q.refetch()} />
  }

  const artist = q.data
  const albums = [...artist.albums].sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))

  // The artist endpoint returns albums only, so "play" loads the newest albums into one queue.
  const playAll = async () => {
    setBusy(true)
    try {
      const full = await Promise.all(albums.slice(0, 6).map((a) => api.getAlbum(a.album_id)))
      const tracks = full.flatMap(albumToTracks)
      if (tracks.length === 0) push('This artist has no tracks')
      else playQueue(tracks, 0, true)
    } catch (e) {
      push(`Could not load tracks: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Hero
        kind="Artist"
        title={artist.name}
        cover={<Cover seed={artist.artist_id} round glyph={artist.name.charAt(0).toUpperCase()} />}
      >
        {artist.country ?? 'Unknown country'} · {albums.length} releases
      </Hero>

      <div className="mb-4 py-2">
        <PlayButton onClick={playAll} busy={busy} label="Play artist" />
      </div>

      <Section title="Discography">
        {albums.length === 0 ? (
          <p className="text-muted">No releases.</p>
        ) : (
          <CardGrid>
            {albums.map((al) => (
              <MediaCard
                key={al.album_id}
                title={al.title}
                subtitle={`${yearOf(al.release_date)} · ${al.album_type}`}
                seed={al.album_id}
                albumId={al.album_id}
                to={`/album/${al.album_id}`}
              />
            ))}
          </CardGrid>
        )}
      </Section>
    </div>
  )
}