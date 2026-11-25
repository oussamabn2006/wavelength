import type { PaymentMethod } from '../../types'

const BRAND: Record<string, string> = {
  visa: 'linear-gradient(135deg,#1a237e,#3949ab)',
  mastercard: 'linear-gradient(135deg,#bf360c,#f57c00)',
  amex: 'linear-gradient(135deg,#006064,#0097a7)',
  discover: 'linear-gradient(135deg,#4a148c,#8e24aa)',
}
const PAYPAL = 'linear-gradient(135deg,#003087,#009cde)'
const FALLBACK = 'linear-gradient(135deg,#374151,#111827)'

export function isExpired(pm: PaymentMethod): boolean {
  if (pm.type !== 'card' || !pm.exp_year || !pm.exp_month) return false
  const now = new Date()
  return pm.exp_year < now.getFullYear() || (pm.exp_year === now.getFullYear() && pm.exp_month < now.getMonth() + 1)
}

export function CardArt({ pm }: { pm: PaymentMethod }) {
  const expired = isExpired(pm)
  const paypal = pm.type === 'paypal'
  const exp = pm.exp_month && pm.exp_year ? `${String(pm.exp_month).padStart(2, '0')}/${String(pm.exp_year).slice(-2)}` : ''
  return (
    <div
      className={`relative aspect-[1.586] w-full max-w-xs overflow-hidden rounded-xl p-5 text-white shadow-lg ${expired ? 'opacity-60 grayscale' : ''}`}
      style={{ background: paypal ? PAYPAL : (BRAND[pm.brand ?? ''] ?? FALLBACK) }}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-black/10" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-lg font-black uppercase italic tracking-wide">{paypal ? 'PayPal' : (pm.brand ?? 'card')}</span>
          {expired && <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase">Expired</span>}
        </div>
        {paypal ? (
          <div className="truncate text-sm">{pm.paypal_email}</div>
        ) : (
          <div>
            <div className="mb-3 h-7 w-10 rounded bg-gradient-to-br from-yellow-200 to-yellow-500 opacity-90" />
            <div className="font-mono text-lg tracking-widest">•••• •••• •••• {pm.last4}</div>
          </div>
        )}
        <div className="flex items-end justify-between text-xs">
          <span className="max-w-[70%] truncate uppercase tracking-wide text-white/80">{pm.holder_name ?? ''}</span>
          {exp && <span className="font-mono">{exp}</span>}
        </div>
      </div>
    </div>
  )
}