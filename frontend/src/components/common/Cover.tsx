import { useCover } from '../../hooks/useCover'
import { gradientFor } from '../../lib/format'

interface Props {
  albumId?: number | null
  seed: number
  round?: boolean
  small?: boolean
  glyph?: string
}

/** Square artwork: the album cover from MinIO if there is one, otherwise a generated gradient. */
export function Cover({ albumId, seed, round = false, small = false, glyph = '♪' }: Props) {
  const { data: url } = useCover(albumId)
  return (
    <span
      className={`relative block aspect-square w-full overflow-hidden shadow-lg shadow-black/40 ${
        round ? 'rounded-full' : small ? 'rounded' : 'rounded-md'
      }`}
      style={{ background: gradientFor(seed) }}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span
          className={`absolute inset-0 flex select-none items-center justify-center text-white/70 ${
            small ? 'text-sm' : 'text-4xl'
          }`}
        >
          {glyph}
        </span>
      )}
    </span>
  )
}