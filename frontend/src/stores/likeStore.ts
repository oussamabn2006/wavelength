import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '../types'

/** Liked songs, kept per user in this browser (no backend table exists for them). */
interface LikeState {
  liked: Record<number, Track[]>
  toggle: (userId: number, track: Track) => void
}

export const useLikes = create<LikeState>()(
  persist(
    (set) => ({
      liked: {},
      toggle: (userId, track) =>
        set((s) => {
          const list = s.liked[userId] ?? []
          const next = list.some((t) => t.track_id === track.track_id)
            ? list.filter((t) => t.track_id !== track.track_id)
            : [track, ...list]
          return { liked: { ...s.liked, [userId]: next } }
        }),
    }),
    { name: 'spotify-likes' },
  ),
)
