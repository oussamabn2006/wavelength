import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { DevToolsTab } from '../components/billing/DevToolsTab'
import { HistoryTab } from '../components/billing/HistoryTab'
import { OverviewTab } from '../components/billing/OverviewTab'
import { PaymentMethodsTab } from '../components/billing/PaymentMethodsTab'
import { PlansTab } from '../components/billing/PlansTab'
import { ACCOUNT_TABS } from '../components/billing/tabs'
import type { AccountTab } from '../components/billing/tabs'
import { Tabs } from '../components/common/Tabs'
import type { TabDef } from '../components/common/Tabs'
import { fmtDate } from '../lib/dates'
import { gradientFor } from '../lib/format'
import { api } from '../services/api'
import { useSession } from '../stores/sessionStore'

export function AccountPage() {
  const userId = useSession((s) => s.userId)
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: AccountTab = ACCOUNT_TABS.includes(raw as AccountTab) ? (raw as AccountTab) : 'overview'
  const setTab = (t: AccountTab) => setParams({ tab: t }, { replace: true })

  const user = useQuery({ queryKey: ['user', userId], queryFn: () => api.user(userId), retry: false })
  const bill = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false })

  const tabs: TabDef<AccountTab>[] = [
    { key: 'overview', label: 'Overview', badge: bill.data?.status === 'past_due' ? '!' : undefined },
    { key: 'plans', label: 'Plans' },
    { key: 'payment', label: 'Payment methods' },
    { key: 'history', label: 'History' },
    { key: 'developer', label: 'Developer tools' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black" style={{ background: gradientFor(userId) }}>
          {(user.data?.display_name ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold">{user.data?.display_name ?? `User ${userId}`}</h1>
          <p className="truncate text-sm text-muted">
            {user.data ? `${user.data.email} · member since ${fmtDate(user.data.created_at)}` : ''}
          </p>
        </div>
      </div>
      {user.isError && <p className="mb-6 text-sm text-amber-400">{user.error.message}. Pick another user in the top bar, or register one under Developer tools.</p>}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab userId={userId} goTo={setTab} />}
      {tab === 'plans' && <PlansTab userId={userId} />}
      {tab === 'payment' && <PaymentMethodsTab userId={userId} />}
      {tab === 'history' && <HistoryTab userId={userId} user={user.data} />}
      {tab === 'developer' && <DevToolsTab userId={userId} />}
    </div>
  )
}