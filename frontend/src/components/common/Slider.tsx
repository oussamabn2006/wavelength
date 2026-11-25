import type { CSSProperties } from 'react'

interface Props {
  value: number
  max: number
  step?: number
  disabled?: boolean
  ariaLabel: string
  className?: string
  onChange: (v: number) => void
  /** Fired when the user releases the pointer or key (used so a seek happens once, not per pixel). */
  onCommit?: (v: number) => void
}

export function Slider({ value, max, step = 0.1, disabled, ariaLabel, className = '', onChange, onCommit }: Props) {
  const top = max > 0 ? max : 1
  const pct = Math.min(100, (Math.min(value, top) / top) * 100)
  const commit = (el: HTMLInputElement) => onCommit?.(Number(el.value))
  return (
    <input
      type="range"
      className={`slider ${className}`}
      min={0}
      max={top}
      step={step}
      value={Math.min(value, top)}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ '--pct': `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => commit(e.currentTarget)}
      onKeyUp={(e) => commit(e.currentTarget)}
      onBlur={(e) => commit(e.currentTarget)}
    />
  )
}