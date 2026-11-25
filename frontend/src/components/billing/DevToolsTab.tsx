import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Panel, Pill } from '../common/Panel'
import { fmtDate } from '../../lib/dates'
import { invalidateBilling } from '../../lib/billing'
import { btnCls, ghostBtnCls, inputCls } from '../../lib/ui'
import { api } from '../../services/api'
import { useSession } from '../../stores/sessionStore'
import { SKIP_LIMIT, useSkips } from '../../stores/skipStore'
import { useToasts } from '../../stores/toastStore'
import type { BillingRun, NewUser } from '../../types'

type Tone = 'ok' | 'warn' | 'bad'
const OUTCOME: Record<string, { tone: Tone; text: string }> = {
  renewed: { tone: 'ok', text: 'charged the saved method and extended the period by one month' },
  switched: { tone: 'ok', text: 'a scheduled plan change took effect and the new plan was charged' },
  ended: { tone: 'warn', text: 'a scheduled cancellation took effect: back on Free' },
  downgraded: { tone: 'warn', text: 'a scheduled downgrade to Free took effect' },
  past_due: { tone: 'warn', text: 'the renewal charge failed: Premium is kept while we retry' },
  retry_failed: { tone: 'warn', text: 'a retry failed: the next one is scheduled' },
  recovered: { tone: 'ok', text: 'a retry succeeded: the subscription is current again' },
  expired: { tone: 'bad', text: 'the last retry failed: back on Free' },
  skipped: { tone: 'ok', text: 'nothing to do' },
  error: { tone: 'bad', text: 'something went wrong: check the backend log' },
}

function Simulator({ userId }: { userId: number }) {
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const bill = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false })
  const [asOf, setAsOf] = useState('')
  const [last, setLast] = useState<BillingRun | null>(null)
  const run = useMutation({
    mutationFn: () => api.runBilling(userId, asOf || undefined),
    onSuccess: (r) => { setLast(r); invalidateBilling(qc, userId) },
    onError: (e: Error) => push(e.message),
  })
  const b = bill.data
  const nextDue = b?.status === 'past_due' ? b.past_due?.next_retry_date : b?.current_period_end

  return (
    <Panel
      title="Billing simulator"
      hint="Runs the same job the billing worker runs, for this user only, as of a date you choose. Show renewals, failed renewals, the retry schedule and the fall back to Free without waiting a month. Tip: add the test card 4000 0000 0000 0341, subscribe, then jump to the next billing date."
    >
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="Simulated date" />
        <button type="button" className={ghostBtnCls} disabled={!nextDue} onClick={() => nextDue && setAsOf(nextDue)}>
          Jump to {b?.status === 'past_due' ? 'next retry' : 'next billing'} date{nextDue ? ` (${fmtDate(nextDue)})` : ''}
        </button>
        <button type="button" className={btnCls} disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Running...' : asOf ? `Run billing as of ${asOf}` : 'Run billing for today'}
        </button>
      </div>
      {last && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-muted">Result for user {last.user_id} as of {fmtDate(last.as_of)}:</div>
          {Object.keys(last.results).length === 0 && <Pill>nothing due</Pill>}
          {Object.entries(last.results).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <Pill tone={OUTCOME[k]?.tone ?? 'muted'}>{k}: {v}</Pill>
              <span className="text-muted">{OUTCOME[k]?.text ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function TestCards() {
  const cards = useQuery({ queryKey: ['test-cards'], queryFn: () => api.testCards(), staleTime: Infinity })
  return (
    <Panel title="Test cards" hint="Simulated gateway: any future expiry, CVC 123 (1234 for Amex).">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted"><tr><th className="pb-2">Number</th><th className="pb-2">Behaviour</th></tr></thead>
        <tbody>
          {cards.data?.map((c) => (
            <tr key={c.number} className="border-t border-white/10">
              <td className="py-2 font-mono tabular-nums">{c.number}</td>
              <td className="py-2"><Pill tone={c.result === 'ok' ? 'ok' : 'warn'}>{c.description}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function Tools({ userId }: { userId: number }) {
  const push = useToasts((s) => s.push)
  return (
    <Panel title="Plan limits" hint={`Free-plan users can skip ${SKIP_LIMIT} songs per hour. Premium is unlimited.`}>
      <button type="button" className={ghostBtnCls} onClick={() => { useSkips.getState().reset(userId); push('Skip counter reset') }}>
        Reset skip counter for user {userId}
      </button>
    </Panel>
  )
}

function Register() {
  const setUserId = useSession((s) => s.setUserId)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', country: '' })
  const [created, setCreated] = useState<{ id: number; name: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const register = useMutation({
    mutationFn: () => {
      const body: NewUser = { email: form.email.trim(), display_name: form.display_name.trim(), password: form.password }
      if (form.country.trim()) body.country = form.country.trim().toUpperCase()
      return api.createUser(body)
    },
    onSuccess: (u) => {
      setCreated({ id: u.user_id, name: u.display_name })
      setErr(null)
      setForm({ email: '', display_name: '', password: '', country: '' })
    },
    onError: (e: Error) => setErr(e.message),
  })
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Panel title="Register a new user" hint="Creates the user and a Free subscription in one transaction. A duplicate email returns HTTP 409.">
      <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); register.mutate() }}>
        <input className={inputCls} placeholder="Email" type="email" required value={form.email} onChange={set('email')} />
        <input className={inputCls} placeholder="Display name" required value={form.display_name} onChange={set('display_name')} />
        <input className={inputCls} placeholder="Password (min 8 characters)" type="password" required minLength={8} value={form.password} onChange={set('password')} />
        <input className={inputCls} placeholder="Country code, e.g. MA (optional)" maxLength={2} value={form.country} onChange={set('country')} />
        <div><button type="submit" disabled={register.isPending} className={btnCls}>{register.isPending ? 'Creating...' : 'Register'}</button></div>
      </form>
      {err && <p className="mt-4 text-sm text-amber-400">{err}</p>}
      {created && (
        <p className="mt-4 text-sm">
          Created <b>{created.name}</b> with user ID <b>{created.id}</b>.{' '}
          <button type="button" onClick={() => setUserId(created.id)} className="font-bold text-accent underline">Act as this user</button>
        </p>
      )}
    </Panel>
  )
}

export function DevToolsTab({ userId }: { userId: number }) {
  return (
    <div className="space-y-6">
      <Simulator userId={userId} />
      <div className="grid gap-6 xl:grid-cols-2">
        <TestCards />
        <Tools userId={userId} />
      </div>
      <Register />
    </div>
  )
}