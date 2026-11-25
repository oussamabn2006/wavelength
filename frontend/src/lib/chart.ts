export const chart = {
  accent: '#1ed760',
  blue: '#4cc9f0',
  amber: '#f5a524',
  grid: 'rgba(255,255,255,0.08)',
  axis: '#a7a7a7',
}

/** Spread onto <Tooltip /> so every chart gets the same dark style. */
export const tooltipProps = {
  contentStyle: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#fff' },
  labelStyle: { color: '#fff' },
  itemStyle: { color: '#fff' },
  cursor: { fill: 'rgba(255,255,255,0.06)' },
}

export const clip = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
