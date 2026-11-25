import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CardGrid, Section } from '../components/common/Section'
import { CardSkeletons, ErrorState } from '../components/common/States'
import { MediaCard } from '../components/music/MediaCard'
import { TrackRow } from '../components/music/TrackRow'
import { useDebounce } from '../hooks/useDebounce'
import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed'
import { seedOf } from '../lib/format'
import { yearOf } from '../lib/tracks'
import { api } from '../services/api'
import { useSession } from '../stores/sessionStore'
import { useToasts } from '../stores/toastStore'

type Tab = 'playlists' | 'recent' | 'browse'
const TABS: [Tab, string][] = [['playlists', 'Playlists'], ['recent', 'Recently played'], ['browse', 'Browse catalog']]

function PlaylistsTab() {
  const userId = useSession((s) => s.userId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const [name, setName] = useState('')
  const q = useQuery({ queryKey: ['playlists', userId], queryFn: () => api.userPlaylists(userId) })

  const create = useMutation({
    mutationFn: (n: string) => api.createPlaylist(userId, n),
    onSuccess: (p) => {
      setName('')
      void qc.invalidateQueries({ queryKey: ['playlists', userId] })
      navigate(`/playlist/${p.playlist_id}`)
    },
    onError: (e: Error) => push(`Could not create: ${e.message}`),
  })

  return (
    <div>
      <form
        className="mb-8 flex max-w-lg gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate(name.trim())
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name"
          maxLength={100}
          className="min-w-0 flex-1 rounded-full bg-white/10 px-5 py-2.5 outline-none ring-white/60 placeholder:text-muted focus:ring-2"
        />
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="rounded-full bg-accent px-6 py-2.5 font-bold text-black hover:bg-accent-2 disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {q.isLoading ? (
        <CardSkeletons />
      ) : q.isError ? (
        <ErrorState message={`Could not load playlists: ${q.error.message}`} onRetry={() => q.refetch()} />
      ) : q.data?.length === 0 ? (
        <p className="text-muted">User {userId} has no playlists yet.</p>
      ) : (
        <CardGrid>
          {q.data?.map((p) => (
            <MediaCard
              key={p.playlist_id}
              title={p.name}
              subtitle={`Playlist · User ${p.user_id}`}
              seed={seedOf(p.playlist_id)}
              glyph="♪"
              to={`/playlist/${p.playlist_id}`}
            />
          ))}
        </CardGrid>
      )}
    </div>
  )
}

function RecentTab() {
  const userId = useSession((s) => s.userId)
  const q = useRecentlyPlayed(userId, 60)
  if (q.isLoading) return <p className="text-muted">Loading history...</p>
  if (q.isError) return <ErrorState message={`Could not load history: ${q.error.message}`} onRetry={() => q.refetch()} />
  if (!q.data?.length) return <p className="text-muted">Nothing played yet for user {userId}.</p>
  const tracks = q.data
  return (
    <div>
      <p className="mb-4 text-sm text-muted">From Cassandra: the latest distinct plays of user {userId}.</p>
      {tracks.map((t, i) => (
        <TrackRow key={t.track_id} track={t} index={i} queue={tracks} />
      ))}
    </div>
  )
}

function BrowseTab() {
  const [text, setText] = useState('')
  const [limit, setLimit] = useState(24)
  const term = useDebounce(text.trim(), 300)

  const albums = useQuery({
    queryKey: ['albums', term, limit],
    queryFn: () => api.searchAlbums(term, limit),
    placeholderData: keepPreviousData,
  })
  const artists = useQuery({
    queryKey: ['artists', term, limit],
    queryFn: () => api.searchArtists(term, limit),
    placeholderData: keepPreviousData,
  })

  return (
    <div>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setLimit(24)
        }}
        placeholder="Filter albums and artists by name"
        className="mb-8 w-full max-w-md rounded-full bg-white/10 px-5 py-2.5 outline-none ring-white/60 placeholder:text-muted focus:ring-2"
      />
      <Section title="Albums">
        {albums.isError ? (
          <ErrorState message={albums.error.message} onRetry={() => albums.refetch()} />
        ) : (
          <CardGrid>
            {albums.data?.map((a) => (
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
        )}
      </Section>
      <Section title="Artists">
        <CardGrid>
          {artists.data?.map((a) => (
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
      <button
        type="button"
        onClick={() => setLimit((l) => l + 24)}
        className="rounded-full border border-white/30 px-6 py-2 font-bold hover:border-white"
      >
        Show more
      </button>
    </div>
  )
}

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('playlists')
  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Your Library</h1>
      <div className="mb-8 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === key ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'playlists' && <PlaylistsTab />}
      {tab === 'recent' && <RecentTab />}
      {tab === 'browse' && <BrowseTab />}
    </div>
  )
}