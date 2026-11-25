import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { CompareBars } from '../components/common/Charts'
import { Metric, PageTitle, Panel, Pill } from '../components/common/Panel'
import { CQL_BENCH, DATASET, PG_BENCH, REDIS_BENCH } from '../lib/benchmarks'
import { fmtMs } from '../lib/ui'
import type { BenchRow } from '../lib/benchmarks'

const SERVICES = [
  { name: 'API', path: '/health' },
  { name: 'PostgreSQL', path: '/health/db' },
  { name: 'Cassandra', path: '/health/cassandra' },
  { name: 'Redis', path: '/health/redis' },
  { name: 'Kafka', path: '/health/kafka' },
  { name: 'MinIO', path: '/health/minio' },
]

function Service({ name, path }: { name: string; path: string }) {
  const q = useQuery({ queryKey: ['health', path], queryFn: () => api.health(path), refetchInterval: 10000, retry: false })
  return (
    <div className="rounded-md bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold">{name}</span>
        <Pill tone={q.isError ? 'bad' : q.data ? 'ok' : 'muted'}>{q.isError ? 'down' : q.data ? 'up' : '...'}</Pill>
      </div>
      <div className="mt-2 text-xs text-muted">
        {q.data ? `${fmtMs(q.data.ms)} round trip` : q.isError ? q.error.message : 'checking'}
      </div>
      <div className="mt-1 text-xs text-muted">{path}</div>
    </div>
  )
}

function Bench({ title, rows, before, after }: { title: string; rows: BenchRow[]; before: string; after: string }) {
  return (
    <Panel title={title}>
      <CompareBars data={rows.map((r) => ({ name: r.short, before: r.before, after: r.after }))} beforeLabel={before} afterLabel={after} />
      <ul className="mt-3 space-y-1 text-xs text-muted">
        {rows.map((r) => <li key={r.short}><span className="font-bold text-white">{r.short}</span> {r.name}: {r.note}</li>)}
      </ul>
    </Panel>
  )
}

export default function System() {
  const stats = useQuery({ queryKey: ['cache-stats'], queryFn: api.cacheStats, refetchInterval: 10000 })
  const s = stats.data
  return (
    <div>
      <PageTitle title="System" subtitle="Service health (refreshed every 10 s) and the measured optimization results for the report." />
      <Panel title="Services">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((x) => <Service key={x.path} {...x} />)}
        </div>
      </Panel>
      <Panel className="mt-4" title="Redis">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Hit ratio" value={s?.hit_ratio == null ? 'n/a' : `${(s.hit_ratio * 100).toFixed(1)}%`} />
          <Metric label="Keys" value={s?.cached_keys ?? '-'} />
          <Metric label="Memory" value={s?.used_memory ?? '-'} sub={s ? `max ${s.maxmemory}` : undefined} />
          <Metric label="Policy" value={s?.eviction_policy ?? '-'} />
        </div>
      </Panel>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Bench title="PostgreSQL: without vs with index (ms)" rows={PG_BENCH} before="Before" after="After" />
        <Bench title="Cassandra: without vs with SAI index (ms)" rows={CQL_BENCH} before="Before" after="After" />
        <Bench title="Redis: cache off vs on (ms)" rows={REDIS_BENCH} before="No cache" after="Cached" />
        <Panel title="Dataset">
          <div className="grid gap-3 sm:grid-cols-2">{DATASET.map(([k, v]) => <Metric key={k} label={k} value={v} />)}</div>
        </Panel>
      </div>
    </div>
  )
}
