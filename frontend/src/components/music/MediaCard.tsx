import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Cover } from '../common/Cover'

interface Props {
  title: string
  subtitle: string
  seed: number
  albumId?: number | null
  round?: boolean
  glyph?: string
  /** Navigates when set. */
  to?: string
  /** Plays when set (a green play button appears on hover). */
  onPlay?: () => void
}

export function MediaCard({ title, subtitle, seed, albumId, round, glyph, to, onPlay }: Props) {
  const inner = (
    <>
      <span className="relative block">
        <Cover albumId={albumId} seed={seed} round={round} glyph={glyph} />
        {onPlay && (
          <span className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100">
            <Play size={20} fill="currentColor" />
          </span>
        )}
      </span>
      <span className="mt-3 block truncate font-bold">{title}</span>
      <span className="block truncate text-sm text-muted">{subtitle}</span>
    </>
  )
  const cls =
    'group block w-full rounded-lg bg-surface p-3 text-left transition hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-white'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onPlay} className={cls}>
      {inner}
    </button>
  )
}