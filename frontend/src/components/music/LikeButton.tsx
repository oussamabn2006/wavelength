import { Heart } from 'lucide-react'
import { useLikes } from '../../stores/likeStore'
import { useSession } from '../../stores/sessionStore'
import type { Track } from '../../types'

export function LikeButton({ track, size = 18 }: { track: Track; size?: number }) {
  const userId = useSession((s) => s.userId)
  const isLiked = useLikes((s) => (s.liked[userId] ?? []).some((t) => t.track_id === track.track_id))
  const toggle = useLikes((s) => s.toggle)
  return (
    <button
      type="button"
      aria-label={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      aria-pressed={isLiked}
      onClick={(e) => { e.stopPropagation(); toggle(userId, track) }}
      className={`transition ${isLiked ? 'text-accent' : 'text-muted hover:text-white'}`}
    >
      <Heart size={size} fill={isLiked ? 'currentColor' : 'none'} />
    </button>
  )
}
