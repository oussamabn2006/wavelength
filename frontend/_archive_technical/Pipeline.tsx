import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { api } from '../services/api'
import type { PlayEventAck } from '../types'
import { Metric, PageTitle, Panel, Pill } from '../components/common/Panel'
import { btnCls, inputCls, sleep, fmtMs, avg } from '../lib/ui'

interface Row { ack: PlayEventAck; status: string; ms: number }

const PIPELINE_STAGES = [
  { name: 'API', detail: 'Accepts the play event' },
  { name: 'Kafka', detail: 'track-events · key = user_id' },
  { name: 'Consumer', detail: 'Processes the event' },
  { name: 'Cassandra', detail: 'Stores listening history' },
]

export default function Pipeline() {
  const [userId, setUserId] = useState(1)
  const [trackId, setTrackId] = useState(1)
  const [count, setCount] = useState(5)
  const [rows, setRows] = useState<Row[]>([])
  const [cmp, setCmp] = useState<{ kafka: number; direct: number } | null>(null)

  const publish = useMutation({
    mutationFn: async () => {
      setRows([])
      const acks: Row[] = []
      for (let i = 0; i < count; i++) {
        const r = await api.logPlayMeta(userId, trackId)
        acks.push({ ack: r.data, status: r.data.status, ms: r.ms })
        setRows([...acks])
      }
      // poll until every event is processed by the consumer (or ~15s)
      for (let t = 0; t < 15; t++) {
        await sleep(1000)
        for (const row of acks) {
          if (row.status === 'processed') continue
          try {
            row.status = (await api.eventStatus(userId, row.ack.event_id)).status
          } catch { /* not visible yet */ }
        }
        setRows([...acks])
        if (acks.every((r) => r.status === 'processed')) break
      }
    },
  })

  const compare = useMutation({
    mutationFn: async () => {
      const k: number[] = []
      const d: number[] = []
      for (let i = 0; i < 10; i++) k.push((await api.logPlayMeta(userId, trackId)).ms)
      for (let i = 0; i < 10; i++) d.push((await api.logPlayDirectMeta(userId, trackId)).ms)
      setCmp({ kafka: avg(k), direct: avg(d) })
    },
  })

  const partitions = new Set(rows.map((r) => r.ack.partition)).size
  const done = rows.filter((r) => r.status === 'processed').length

  return (
    <div>
      <PageTitle title="Event pipeline" />
      <section aria-label="Event delivery flow" className="mb-4 rounded-lg border border-white/10 bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Asynchronous delivery</h2>
            <p className="mt-0.5 text-sm text-muted">Events are processed by the consumer after Kafka accepts them.</p>
          </div>
          <Pill tone="ok">202 Accepted</Pill>
        </div>
        <ol className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {PIPELINE_STAGES.map((stage, index) => (
            <li key={stage.name} className="contents">
              <div className="flex-1 rounded-md bg-surface-2 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Step {index + 1}</div>
                <div className="mt-1 font-bold">{stage.name}</div>
                <div className="mt-0.5 text-xs text-muted">{stage.detail}</div>
              </div>
              {index < PIPELINE_STAGES.length - 1 && (
                <>
                  <ArrowDown aria-hidden="true" className="mx-auto h-4 w-4 text-muted lg:hidden" />
                  <ArrowRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-muted lg:block" />
                </>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-muted">
          The API responds once the broker has accepted the event; Cassandra processing happens asynchronously.
        </p>
      </section>
      <Panel title="Publish play events"
        actions={<button className={btnCls} onClick={() => publish.mutate()} disabled={publish.isPending}>{publish.isPending ? 'Working...' : 'Publish'}</button>}>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <label>User <input type="number" min={1} value={userId} onChange={(e) => setUserId(Number(e.target.value) || 1)} className={`${inputCls} ml-1 w-24`} /></label>
          <label>Track <input type="number" min={1} value={trackId} onChange={(e) => setTrackId(Number(e.target.value) || 1)} className={`${inputCls} ml-1 w-28`} /></label>
          <label>Events <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.min(50, Number(e.target.value) || 1))} className={`${inputCls} ml-1 w-20`} /></label>
        </div>
        {publish.isError && <p className="mb-3 text-sm text-red-300">{publish.error.message}</p>}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Accepted (202)" value={rows.length} />
          <Metric label="Processed" value={done} sub={rows.length ? `${rows.length - done} pending` : undefined} />
          <Metric label="Partitions used" value={partitions || '-'} sub="same user = same partition" />
        </div>
        {rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Event</th><th>Partition</th><th>Offset</th><th>API time</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ack.event_id} className="border-t border-white/10">
                  <td className="py-2 font-mono text-xs">{r.ack.event_id.slice(0, 8)}</td>
                  <td>{r.ack.partition}</td>
                  <td>{r.ack.offset}</td>
                  <td className="tabular-nums">{fmtMs(r.ms)}</td>
                  <td><Pill tone={r.status === 'processed' ? 'ok' : 'warn'}>{r.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="mt-4" title="Kafka vs direct write" hint="Average API response time over 10 calls each. Kafka returns after publishing; the direct path waits for Cassandra."
        actions={<button className={btnCls} onClick={() => compare.mutate()} disabled={compare.isPending}>{compare.isPending ? 'Running...' : 'Compare'}</button>}>
        {compare.isError && <p className="text-sm text-red-300">{compare.error.message}</p>}
        {cmp && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Via Kafka (202)" value={fmtMs(cmp.kafka)} />
            <Metric label="Direct to Cassandra" value={fmtMs(cmp.direct)} />
          </div>
        )}
      </Panel>
    </div>
  )
}
