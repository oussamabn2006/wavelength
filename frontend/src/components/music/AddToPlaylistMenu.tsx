import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../../services/api'
import { useSession } from '../../stores/sessionStore'
import { useToasts } from '../../stores/toastStore'
import type { Playlist, Track } from '../../types'

export function AddToPlaylistMenu({ track }: { track: Track }) {
  const userId = useSession((s) => s.userId)
  const push = useToasts((s) => s.push)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const playlists = useQuery({ queryKey: ['playlists', userId], queryFn: () => api.userPlaylists(userId) })

  const add = useMutation({
    mutationFn: (p: Playlist) => api.addPlaylistTrack(p.playlist_id, track.track_id),
    onSuccess: (_r, p) => {
      push(`Added "${track.title}" to ${p.name}`)
      void qc.invalidateQueries({ queryKey: ['playlist', p.playlist_id] })
      setOpen(false)
    },
    onError: (e: Error) => push(`Could not add: ${e.message}`),
  })

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Add to playlist"
        aria-expanded={open}
        data-open={open ? 'true' : 'false'}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted opacity-0 transition hover:text-white focus:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100"
      >
        <Plus size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-md bg-surface-3 p-1 shadow-2xl">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted">Add to playlist</div>
          {playlists.data?.length === 0 && (
            <Link to="/library" className="block rounded px-3 py-2 text-sm hover:bg-white/10">
              No playlists yet: create one
            </Link>
          )}
          {playlists.data?.map((p) => (
            <button
              key={p.playlist_id}
              type="button"
              disabled={add.isPending}
              onClick={() => add.mutate(p)}
              className="block w-full truncate rounded px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}