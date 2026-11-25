import type { QueryClient } from '@tanstack/react-query'
import type { PaymentMethod } from '../types'

/** Everything that shows billing state refetches after a change. */
export function invalidateBilling(qc: QueryClient, userId: number) {
  for (const key of ['billing', 'pm', 'payments', 'sub', 'subs', 'user']) {
    void qc.invalidateQueries({ queryKey: [key, userId] })
  }
}

/** One key per user action: replaying the same key can never charge twice. */
export const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`

export function methodLabel(pm: PaymentMethod | null | undefined): string {
  if (!pm) return 'No payment method'
  if (pm.type === 'paypal') return `PayPal (${pm.paypal_email})`
  return `${(pm.brand ?? 'card').toUpperCase()} •••• ${pm.last4}`
}