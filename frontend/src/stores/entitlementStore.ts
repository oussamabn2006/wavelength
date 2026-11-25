import { create } from 'zustand'

/** What the current plan allows. Written by EntitlementSync, read by the player. */
interface EntitlementState {
  planName: string | null
  limited: boolean // true on plans with ads (Free): skips are capped
  set: (planName: string | null, limited: boolean) => void
}

export const useEntitlements = create<EntitlementState>()((set) => ({
  planName: null,
  limited: false, // until the plan is known, never block the user
  set: (planName, limited) => set({ planName, limited }),
}))