import { create } from 'zustand'

/** Keeps the search text when you navigate away from the Search page and back. */
interface SearchUi {
  text: string
  setText: (text: string) => void
}

export const useSearchUi = create<SearchUi>()((set) => ({
  text: '',
  setText: (text) => set({ text }),
}))