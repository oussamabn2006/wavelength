import { useEffect } from 'react'
import { skipNext } from '../lib/skip'
import { usePlayer } from '../stores/playerStore'

/**
 * Space play/pause, ←/→ seek 5 s, Shift+←/→ previous/next, M mute, N next, P previous.
 * Ignored while typing in a field. Space is left alone when a button or link has focus.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const p = usePlayer.getState()
      switch (e.key) {
        case ' ':
          if (el?.closest('button, a')) return
          e.preventDefault()
          p.togglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) skipNext()
          else p.seek(p.currentTime + 5)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) p.prev()
          else p.seek(p.currentTime - 5)
          break
        case 'n':
        case 'N':
          skipNext()
          break
        case 'p':
        case 'P':
          p.prev()
          break
        case 'm':
        case 'M':
          p.toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}