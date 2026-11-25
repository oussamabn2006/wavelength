import { SKIP_LIMIT } from '../stores/skipStore'
import type { PlanBrief } from '../types'
import { gradientFor, seedOf } from './format'
import { fmtMoney } from './ui'

const THEMES: [string, string][] = [
  ['free', 'linear-gradient(135deg,#4b5563,#1f2937)'],
  ['individual', 'linear-gradient(135deg,#1ed760,#0d6b30)'],
  ['duo', 'linear-gradient(135deg,#a855f7,#5b21b6)'],
  ['family', 'linear-gradient(135deg,#fb923c,#b45309)'],
  ['student', 'linear-gradient(135deg,#38bdf8,#1d4ed8)'],
]

export function planGradient(name: string): string {
  const n = name.toLowerCase()
  return THEMES.find(([key]) => n.includes(key))?.[1] ?? gradientFor(seedOf(name))
}

export const perAccount = (p: PlanBrief) => p.monthly_price / Math.max(p.max_accounts, 1)

/** Only features that exist in this app: stored plan fields and the skip limit. */
export function planFeatures(p: PlanBrief): string[] {
  const out = [
    p.max_accounts > 1 ? `${p.max_accounts} accounts` : '1 account',
    p.has_ads ? 'Ad-supported listening' : 'Ad-free listening',
    p.has_ads ? `${SKIP_LIMIT} skips per hour` : 'Unlimited skips',
  ]
  if (p.monthly_price > 0 && p.max_accounts > 1) out.push(`${fmtMoney(perAccount(p))} per account`)
  return out
}

export type Direction = 'upgrade' | 'downgrade' | 'same'

export function direction(cur: PlanBrief | undefined, target: PlanBrief): Direction {
  if (!cur || cur.plan_id === target.plan_id) return 'same'
  return target.monthly_price >= cur.monthly_price ? 'upgrade' : 'downgrade' // same rule as the backend
}