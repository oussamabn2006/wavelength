import { create } from 'zustand'

interface Toast { id: number; text: string }
interface ToastState {
  toasts: Toast[]
  push: (text: string) => void
}

let nextId = 1

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (text) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, text }].slice(-4) }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },
}))