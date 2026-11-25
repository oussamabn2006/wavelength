import { Link } from 'react-router-dom'
import { Pause, Play, X } from 'lucide-react'
import { Cover } from '../common/Cover'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { LikeButton } from './LikeButton'
import { formatDuration } from '../../lib/format'
import { usePlayer } from '../../stores/playerStore'
import type { Track } from '../../types'

interface Props {
  track: Track
  index: number
  /** The list this row belongs to: clicking play queues the whole list from this row. */
  queue: Track[]
  /** When set, a remove button appears on hover (used on playlist pages). */
  onRemove?: () => void
}

export function TrackRow({ track, index, queue, onRemove }: Props) {
  const isCurrent = usePlayer((s) => s.current?.track_id === track.track_id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const playQueue = usePlayer((s) => s.playQueue)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const active = isCurrent && isPlaying

  return (
    <div
      className={`group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-2 hover:bg-white/10 md:grid-cols-[2.5rem_minmax(0,4fr)_minmax(0,3fr)_auto] ${
        isCurrent ? 'bg-white/5' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => (isCurrent ? togglePlay() : playQueue(queue, index))}
        aria-label={active ? `Pause ${track.title}` : `Play ${track.title}`}
        className="flex h-8 w-8 items-center justify-center text-muted"
      >
        <span className={`group-hover:hidden ${isCurrent ? 'text-accent' : ''}`}>{active ? '♫' : index + 1}</span>
        <span className="hidden text-white group-hover:block">
          {active ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </span>
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0">
          <Cover albumId={track.album_id} seed={track.album_id} small />
        </div>
        <div className="min-w-0">
          <div className={`truncate font-medium ${isCurrent ? 'text-accent' : ''}`}>{track.title}</div>
          <div className="truncate text-sm text-muted">
            {track.is_explicit && (
              <span className="mr-1.5 rounded-sm bg-muted px-1 text-[10px] font-bold text-black">E</span>
            )}
            {track.artists}
          </div>
        </div>
      </div>

      {track.album_id > 0 ? (
        <Link
          to={`/album/${track.album_id}`}
          className="hidden truncate text-sm text-muted hover:text-white hover:underline md:block"
        >
          {track.album_title}
        </Link>
      ) : (
        <span className="hidden truncate text-sm text-muted md:block">{track.album_title}</span>
      )}

      <div className="flex items-center justify-end gap-2">
        <AddToPlaylistMenu track={track} />
        <LikeButton track={track} />
        <span className="w-10 text-right text-sm tabular-nums text-muted">{formatDuration(track.duration_ms)}</span>
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${track.title} from playlist`}
            onClick={onRemove}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted opacity-0 transition hover:text-white focus:opacity-100 group-hover:opacity-100"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}