export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const formatDuration = (ms: number): string => formatTime(ms / 1000)

/** 'YYYY-MM' strings, newest first (UTC, like the backend). */
export function recentMonths(n = 3): string[] {
  const d = new Date()
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m--
    if (m < 0) {
      m = 11
      y--
    }
  }
  return out
}

/** Stable placeholder artwork for items that have no cover. */
export function gradientFor(seed: number): string {
  const h = (Math.abs(Math.trunc(seed)) * 47) % 360
  return `linear-gradient(135deg, hsl(${h} 55% 40%), hsl(${(h + 45) % 360} 60% 22%))`
}

export function seedOf(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}