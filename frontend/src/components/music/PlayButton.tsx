import { Loader2, Play } from 'lucide-react'

export function PlayButton({ onClick, busy = false, label = 'Play' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={busy}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:scale-105 hover:bg-accent-2 disabled:opacity-60"
    >
      {busy ? <Loader2 className="animate-spin" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
    </button>
  )
}