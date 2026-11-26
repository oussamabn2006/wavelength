import { Heart } from 'lucide-react'
import { useLikes } from '../../stores/likeStore'
import { useAuth } from '../../stores/authStore'
import { useLoginPrompt } from '../../stores/loginPromptStore'
import { useSession } from '../../stores/sessionStore'
import type { Track } from '../../types'

export function LikeButton({ track, size = 18 }: { track: Track; size?: number }) {
  const userId = useSession((s) => s.userId)
  const hasLike = useLikes((s) => (s.liked[userId] ?? []).some((t) => t.track_id === track.track_id))
  const toggle = useLikes((s) => s.toggle)
  const token = useAuth((s) => s.token)
  const ask = useLoginPrompt((s) => s.ask)
  const isLiked = !!token && hasLike // a logged-out visitor never sees someone's hearts
  return (
    <button
      type="button"
      aria-label={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      aria-pressed={isLiked}
      onClick={(e) => { e.stopPropagation(); if (!token) ask('like'); else toggle(userId, track) }}
      className={`transition ${isLiked ? 'text-accent' : 'text-muted hover:text-white'}`}
    >
      <Heart size={size} fill={isLiked ? 'currentColor' : 'none'} />
    </button>
  )
}
