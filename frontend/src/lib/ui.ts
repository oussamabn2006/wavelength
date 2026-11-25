export const inputCls =
  'rounded-md bg-white/10 px-3 py-2 text-sm outline-none ring-white/60 placeholder:text-muted focus:ring-2'
export const btnCls =
  'rounded-full bg-accent px-5 py-2 text-sm font-bold text-black transition hover:bg-accent-2 disabled:opacity-50'
export const ghostBtnCls =
  'rounded-full border border-white/30 px-4 py-1.5 text-sm font-semibold transition hover:border-white disabled:opacity-50'

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString()
export const fmtMs = (ms: number) => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`
export const fmtMoney = (n: number) => `$${n.toFixed(2)}`
export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
