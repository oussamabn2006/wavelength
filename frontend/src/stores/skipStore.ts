import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const SKIP_LIMIT = 6
export const WINDOW_MS = 60 * 60 * 1000

interface SkipState {
  byUser: Record<number, number[]> // timestamps of recent skips, per user
  tryUse: (userId: number) => boolean
  reset: (userId: number) => void
}

export const useSkips = create<SkipState>()(
  persist(
    (set, get) => ({
      byUser: {},
      tryUse: (userId) => {
        const now = Date.now()
        const recent = (get().byUser[userId] ?? []).filter((t) => now - t < WINDOW_MS)
        if (recent.length >= SKIP_LIMIT) {
          set((s) => ({ byUser: { ...s.byUser, [userId]: recent } }))
          return false
        }
        set((s) => ({ byUser: { ...s.byUser, [userId]: [...recent, now] } }))
        return true
      },
      reset: (userId) => set((s) => ({ byUser: { ...s.byUser, [userId]: [] } })),
    }),
    { name: 'spotify-skips', partialize: (s) => ({ byUser: s.byUser }) },
  ),
)