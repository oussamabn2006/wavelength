import { create } from 'zustand'

export type LoginReason = 'play' | 'like' | 'playlist' | 'library' | 'generic'

interface PromptState {
  reason: LoginReason | null
  ask: (reason: LoginReason) => void
  close: () => void
}

/** Drives the "Log in to continue" dialog shown when a logged-out visitor tries a member-only action. */
export const useLoginPrompt = create<PromptState>((set) => ({
  reason: null,
  ask: (reason) => set({ reason }),
  close: () => set({ reason: null }),
}))
