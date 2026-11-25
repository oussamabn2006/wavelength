import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { CardGrid, Section } from '../components/common/Section'
import { ErrorState } from '../components/common/States'
import { MediaCard } from '../components/music/MediaCard'
import { TrackRow } from '../components/music/TrackRow'
import { useDebounce } from '../hooks/useDebounce'
import { yearOf } from '../lib/tracks'
import { api } from '../services/api'
import { useSearchUi } from '../stores/searchStore'

export function SearchPage() {
  const text = useSearchUi((s) => s.text)
  const setText = useSearchUi((s) => s.setText)
  const q = useDebounce(text.trim(), 300)
  const on = { enabled: q.length > 0, placeholderData: keepPreviousData }

  const tracks = useQuery({ queryKey: ['search', 'tracks', q, 30], queryFn: () => api.searchTracks(q, 30), ...on })
  const artists = useQuery({ queryKey: ['search', 'artists', q], queryFn: () => api.searchArtists(q, 6), ...on })
  const albums = useQuery({ queryKey: ['search', 'albums', q], queryFn: () => api.searchAlbums(q, 6), ...on })

  return (
    <div>
      <label className="relative mb-8 block max-w-xl">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to play?"
          className="w-full rounded-full bg-white/10 py-3 pl-12 pr-4 outline-none ring-white/60 placeholder:text-muted focus:ring-2"
        />
      </label>

      {q.length === 0 && (
        <p className="text-muted">Search songs, artists and albums. Try a word from a title, for example "strategy".</p>
      )}

      {q.length > 0 && (
        <>
          {artists.data && artists.data.length > 0 && (
            <Section title="Artists">
              <CardGrid>
                {artists.data.map((a) => (
                  <MediaCard
                    key={a.artist_id}
                    title={a.name}
                    subtitle="Artist"
                    seed={a.artist_id}
                    round
                    glyph={a.name.charAt(0).toUpperCase()}
                    to={`/artist/${a.artist_id}`}
                  />
                ))}
              </CardGrid>
            </Section>
          )}

          {albums.data && albums.data.length > 0 && (
            <Section title="Albums">
              <CardGrid>
                {albums.data.map((a) => (
                  <MediaCard
                    key={a.album_id}
                    title={a.title}
                    subtitle={`${yearOf(a.release_date)} · ${a.artists}`}
                    seed={a.album_id}
                    albumId={a.album_id}
                    to={`/album/${a.album_id}`}
                  />
                ))}
              </CardGrid>
            </Section>
          )}

          <Section title="Songs">
            {tracks.isError ? (
              <ErrorState message={`Search failed: ${tracks.error.message}`} onRetry={() => tracks.refetch()} />
            ) : tracks.data === undefined ? (
              <p className="text-muted">Searching...</p>
            ) : tracks.data.length === 0 ? (
              <p className="text-muted">No songs found for "{q}".</p>
            ) : (
              <div className={tracks.isFetching ? 'opacity-60 transition' : 'transition'}>
                {tracks.data.map((t, i) => (
                  <TrackRow key={t.track_id} track={t} index={i} queue={tracks.data} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}