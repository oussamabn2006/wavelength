import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** There is no login: the UI "acts as" a user ID, remembered across reloads. */
interface SessionState {
  userId: number
  setUserId: (id: number) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: 1,
      setUserId: (id) => set({ userId: Math.max(1, Math.floor(id) || 1) }),
    }),
    { name: 'spotify-session' },
  ),
)