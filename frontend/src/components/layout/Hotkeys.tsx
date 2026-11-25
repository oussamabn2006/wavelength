import { useEffect } from 'react'
import { usePlayer } from '../../stores/playerStore'

/** Spotify desktop shortcuts: Space = play/pause, Ctrl+Right/Left = next/previous. Render once in Layout. */
export function Hotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const p = usePlayer.getState()
      if (e.code === 'Space') { e.preventDefault(); p.togglePlay() }
      else if (e.ctrlKey && e.code === 'ArrowRight') p.next()
      else if (e.ctrlKey && e.code === 'ArrowLeft') p.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
