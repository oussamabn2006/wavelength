import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../services/api'
import type { Meta } from '../services/api'
import { CacheBadge, Metric, PageTitle, Panel } from '../components/common/Panel'
import { HBar } from '../components/common/Charts'
import { btnCls, ghostBtnCls, inputCls, avg, fmtMoney, fmtMs } from '../lib/ui'
import { clip } from '../lib/chart'

const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function Analytics() {
  const qc = useQueryClient()
  const [month, setMonth] = useState('2026-10')
  const [limit, setLimit] = useState(10)
  const [bypass, setBypass] = useState(false)

  const tracks = useQuery({ queryKey: ['an-tracks', month, limit, bypass], queryFn: () => api.topTracksMeta(month, limit, bypass), staleTime: 0, gcTime: 0 })
  const artists = useQuery({ queryKey: ['an-artists', month, limit, bypass], queryFn: () => api.topArtistsMeta(month, limit, bypass), staleTime: 0, gcTime: 0 })
  const revenue = useQuery({ queryKey: ['an-revenue', bypass], queryFn: () => api.revenueMeta(bypass), staleTime: 0, gcTime: 0 })
  const stats = useQuery({ queryKey: ['cache-stats'], queryFn: api.cacheStats, refetchInterval: 5000 })

  const flush = useMutation({
    mutationFn: (reset: boolean) => api.flushCache(reset),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cache-stats'] }),
  })

  const [runs, setRuns] = useState<{ label: string; ms: number }[]>([])
  const demo = useMutation({
    mutationFn: async () => {
      const out: { label: string; ms: number }[] = []
      const time = async (label: string, p: Promise<Meta<unknown>>) => {
        const r = await p
        out.push({ label: `${label} (${r.cache ?? 'n/a'})`, ms: r.ms })
      }
      await api.flushCache(false)
      await time('1st call, cold cache', api.topArtistsMeta(month, limit))
      for (let i = 2; i <= 4; i++) await time(`call ${i}, warm cache`, api.topArtistsMeta(month, limit))
      await time('bypass (?cache=false)', api.topArtistsMeta(month, limit, true))
      return out
    },
    onSuccess: (o) => { setRuns(o); qc.invalidateQueries({ queryKey: ['cache-stats'] }) },
  })

  const s = stats.data
  return (
    <div>
      <PageTitle title="Analytics" subtitle="Heavy analytical queries on PostgreSQL, served through a Redis cache-aside layer. Each result shows the X-Cache header and the round-trip time." />

      <Panel title="Query controls">
        <div className="flex flex-wrap items-center gap-3">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className={inputCls} />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={inputCls}>
            {[5, 10, 20].map((n) => <option key={n} value={n} className="bg-surface">Top {n}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} /> Bypass cache
          </label>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Top tracks" actions={tracks.data && <CacheBadge cache={tracks.data.cache} ms={tracks.data.ms} />}>
          {tracks.isError ? <p className="text-sm text-red-300">{tracks.error.message}</p> :
            <HBar data={(tracks.data?.data ?? []).map((t) => ({ label: clip(t.title), value: t.play_count }))} />}
        </Panel>
        <Panel title="Top artists" hint="The most expensive query: join + aggregation over the monthly statistics." actions={artists.data && <CacheBadge cache={artists.data.cache} ms={artists.data.ms} />}>
          {artists.isError ? <p className="text-sm text-red-300">{artists.error.message}</p> :
            <HBar data={(artists.data?.data ?? []).map((a) => ({ label: clip(a.name), value: a.play_count }))} />}
        </Panel>
      </div>

      <Panel className="mt-4" title="Revenue by plan" actions={revenue.data && <CacheBadge cache={revenue.data.cache} ms={revenue.data.ms} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(revenue.data?.data ?? []).map((r) => (
            <Metric key={r.plan_name} label={r.plan_name} value={fmtMoney(Number(r.revenue))} sub={`${r.payments} payments`} />
          ))}
        </div>
      </Panel>

      <Panel className="mt-4" title="Redis cache" hint="Live statistics, refreshed every 5 seconds."
        actions={<div className="flex gap-2">
          <button className={ghostBtnCls} onClick={() => flush.mutate(false)} disabled={flush.isPending}>Flush cache</button>
          <button className={ghostBtnCls} onClick={() => flush.mutate(true)} disabled={flush.isPending}>Flush + reset metrics</button>
        </div>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Hit ratio" value={s?.hit_ratio == null ? 'n/a' : `${(s.hit_ratio * 100).toFixed(1)}%`} sub={s ? `${s.hits} hits / ${s.misses} misses` : undefined} />
          <Metric label="Cached keys" value={s?.cached_keys ?? '-'} />
          <Metric label="Memory" value={s?.used_memory ?? '-'} sub={s ? `max ${s.maxmemory}` : undefined} />
          <Metric label="Eviction" value={s?.eviction_policy ?? '-'} sub={s ? `${s.evicted_keys} evicted` : undefined} />
        </div>
      </Panel>

      <Panel className="mt-4" title="Cache demo" hint="Flushes the cache, then calls top-artists four times and once with the cache bypassed."
        actions={<button className={btnCls} onClick={() => demo.mutate()} disabled={demo.isPending}>{demo.isPending ? 'Running...' : 'Run demo'}</button>}>
        {demo.isError && <p className="text-sm text-red-300">{demo.error.message}</p>}
        {runs.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {runs.map((r) => (
                <tr key={r.label} className="border-b border-white/10">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMs(r.ms)}</td>
                </tr>
              ))}
              <tr><td className="pt-2 text-muted">Average of warm calls</td>
                <td className="pt-2 text-right font-bold tabular-nums text-accent">{fmtMs(avg(runs.slice(1, 4).map((r) => r.ms)))}</td></tr>
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
