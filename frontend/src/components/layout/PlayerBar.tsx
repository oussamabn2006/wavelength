import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react'
import { Cover } from '../common/Cover'
import { LikeButton } from '../music/LikeButton'
import { Slider } from '../common/Slider'
import { formatTime } from '../../lib/format'
import { skipNext } from '../../lib/skip'
import { usePlayer } from '../../stores/playerStore'
import { SkipMeter } from './SkipMeter'

const ctl = 'transition disabled:opacity-40'
const on = 'text-accent'
const off = 'text-muted hover:text-white'

export function PlayerBar() {
  const current = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const loading = usePlayer((s) => s.loading)
  const error = usePlayer((s) => s.error)
  const currentTime = usePlayer((s) => s.currentTime)
  const duration = usePlayer((s) => s.duration)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const { togglePlay, prev, seek, setVolume, toggleMute, toggleShuffle, cycleRepeat } =
    usePlayer.getState()

  // While the user drags the seek bar we show the dragged value and seek once on release.
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? currentTime
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="grid h-[88px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-4 bg-black px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
      {/* now playing */}
      <div className="flex min-w-0 items-center gap-3">
        {current ? (
          <>
            <div className="h-14 w-14 shrink-0">
              <Cover albumId={current.album_id} seed={current.album_id} small />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link to={`/album/${current.album_id}`} className="block truncate text-sm font-medium hover:underline">
                  {current.title}
                </Link>
                {current && <LikeButton track={current} />}
              </div>
              <div className="truncate text-xs text-muted">{current.artists}</div>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">Pick something to play</div>
        )}
      </div>

      {/* controls + seek */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button type="button" aria-label="Shuffle" onClick={toggleShuffle} className={`${ctl} ${shuffle ? on : off}`}>
            <Shuffle size={18} />
          </button>
          <button type="button" aria-label="Previous" onClick={prev} disabled={!current} className={`${ctl} ${off}`}>
            <SkipBack size={22} fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
            disabled={!current}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button type="button" aria-label="Next" onClick={skipNext} disabled={!current} className={`${ctl} ${off}`}>
            <SkipForward size={22} fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={`Repeat: ${repeat}`}
            onClick={cycleRepeat}
            className={`${ctl} ${repeat === 'off' ? off : on}`}
          >
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>

        <div className="group flex w-full max-w-xl items-center gap-2 text-xs text-muted">
          <span className="w-10 text-right tabular-nums">{formatTime(shown)}</span>
          <Slider
            className="min-w-0 flex-1"
            ariaLabel="Seek"
            value={shown}
            max={duration}
            disabled={!current || !duration}
            onChange={setDrag}
            onCommit={(v) => {
              if (drag !== null) seek(v)
              setDrag(null)
            }}
          />
          <span className="w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
        {error && <div className="text-xs text-amber-400">{error}</div>}
      </div>

      {/* volume controls */}
      <div className="hidden items-center justify-end gap-3 lg:flex">
        <SkipMeter />
        <button type="button" aria-label="Mute" onClick={toggleMute} className={`${ctl} ${off}`}>
          <VolumeIcon size={20} />
        </button>
        <div className="group w-28">
          <Slider ariaLabel="Volume" value={muted ? 0 : volume} max={1} step={0.01} onChange={setVolume} />
        </div>
      </div>
    </footer>
  )
}