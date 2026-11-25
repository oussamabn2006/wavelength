import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Cover } from '../components/common/Cover'
import { ErrorState } from '../components/common/States'
import { Hero } from '../components/music/Hero'
import { PlayButton } from '../components/music/PlayButton'
import { TrackRow } from '../components/music/TrackRow'
import { useDebounce } from '../hooks/useDebounce'
import { formatDuration, seedOf } from '../lib/format'
import { api } from '../services/api'
import { usePlayer } from '../stores/playerStore'
import { useSession } from '../stores/sessionStore'
import { useToasts } from '../stores/toastStore'
import type { PlaylistTrack } from '../types'

export function PlaylistPage() {
  const { id = '' } = useParams()
  const userId = useSession((s) => s.userId)
  const playQueue = usePlayer((s) => s.playQueue)
  const push = useToasts((s) => s.push)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const term = useDebounce(text.trim(), 300)

  const q = useQuery({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const detail = await api.getPlaylist(id)
      // Playlist rows are denormalized (no album id), so resolve each to a full track.
      const tracks = await Promise.all(
        detail.tracks.map(async (t): Promise<PlaylistTrack> => {
          try {
            return { ...(await api.getTrack(t.track_id)), position: t.track_position }
          } catch {
            return {
              track_id: t.track_id, title: t.track_title, duration_ms: t.duration_ms,
              album_id: 0, album_title: '', artists: t.artist_names, position: t.track_position,
            }
          }
        }),
      )
      return { detail, tracks }
    },
    enabled: id !== '',
  })

  const found = useQuery({
    queryKey: ['search', 'tracks', term, 8],
    queryFn: () => api.searchTracks(term, 8),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['playlist', id] })
    void qc.invalidateQueries({ queryKey: ['playlists', userId] })
  }
  const add = useMutation({
    mutationFn: (trackId: number) => api.addPlaylistTrack(id, trackId),
    onSuccess: () => {
      push('Added to playlist')
      refresh()
    },
    onError: (e: Error) => push(`Could not add: ${e.message}`),
  })
  const remove = useMutation({
    mutationFn: (position: number) => api.removePlaylistTrack(id, position),
    onSuccess: refresh,
    onError: (e: Error) => push(`Could not remove: ${e.message}`),
  })

  if (q.isLoading) return <p className="text-muted">Loading playlist...</p>
  if (q.isError || !q.data) {
    return <ErrorState message={q.error?.message ?? 'Playlist not found'} onRetry={() => q.refetch()} />
  }

  const { detail, tracks } = q.data
  const total = tracks.reduce((sum, t) => sum + t.duration_ms, 0)

  return (
    <div>
      <Hero kind="Playlist" title={detail.name} cover={<Cover seed={seedOf(id)} glyph="♪" />}>
        {detail.description && <p className="mb-1">{detail.description}</p>}
        <span className="font-bold text-white">User {detail.user_id}</span> · {tracks.length} songs
        {tracks.length > 0 && `, ${formatDuration(total)}`}
      </Hero>

      {tracks.length > 0 && (
        <div className="mb-4 py-2">
          <PlayButton onClick={() => playQueue(tracks, 0, true)} label="Play playlist" />
        </div>
      )}

      {tracks.length === 0 && <p className="mb-6 text-muted">This playlist is empty. Find some songs below.</p>}
      <div>
        {tracks.map((t, i) => (
          <TrackRow
            key={t.position}
            track={t}
            index={i}
            queue={tracks}
            onRemove={() => remove.mutate(t.position)}
          />
        ))}
      </div>

      <section className="mt-12 max-w-3xl border-t border-white/10 pt-8">
        <h2 className="mb-1 text-2xl font-bold">Let's find something for your playlist</h2>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search for songs"
          className="my-4 w-full max-w-md rounded-full bg-white/10 px-5 py-2.5 outline-none ring-white/60 placeholder:text-muted focus:ring-2"
        />
        {term.length > 0 && found.data?.length === 0 && <p className="text-muted">No songs found.</p>}
        {found.data?.map((t) => (
          <div key={t.track_id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/10">
            <div className="h-10 w-10 shrink-0">
              <Cover albumId={t.album_id} seed={t.album_id} small />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.title}</div>
              <div className="truncate text-sm text-muted">{t.artists}</div>
            </div>
            <button
              type="button"
              disabled={add.isPending}
              onClick={() => add.mutate(t.track_id)}
              className="flex items-center gap-1 rounded-full border border-white/30 px-4 py-1 text-sm font-bold hover:scale-105 hover:border-white disabled:opacity-50"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}