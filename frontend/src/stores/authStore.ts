import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'
import { useSession } from './sessionStore'

interface AuthState {
  token: string | null
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      signIn: (token, user) => {
        useSession.getState().setUserId(user.user_id) // every page reads the user id from the session store
        set({ token, user })
      },
      signOut: () => set({ token: null, user: null }),
    }),
    { name: 'spotify-auth' },
  ),
)
