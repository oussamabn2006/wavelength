import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { chart, tooltipProps } from '../../lib/chart'

export function HBar({ data, name = 'plays', color = chart.accent }: {
  data: { label: string; value: number }[]
  name?: string
  color?: string
}) {
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30 + 24)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={chart.grid} horizontal={false} />
          <XAxis type="number" stroke={chart.axis} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={170} stroke={chart.axis} tick={{ fontSize: 12 }} interval={0} />
          <Tooltip {...tooltipProps} formatter={(v: unknown) => [Number(v).toLocaleString(), name]} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface CompareRow {
  name: string
  before: number
  after: number
}

export function CompareBars({ data, beforeLabel, afterLabel }: {
  data: CompareRow[]
  beforeLabel: string
  afterLabel: string
}) {
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="name" stroke={chart.axis} tick={{ fontSize: 12 }} interval={0} />
          <YAxis stroke={chart.axis} tick={{ fontSize: 12 }} />
          <Tooltip {...tooltipProps} formatter={(v: unknown) => `${Number(v)} ms`} />
          <Legend wrapperStyle={{ color: chart.axis, fontSize: 12 }} />
          <Bar dataKey="before" name={beforeLabel} fill={chart.amber} radius={[4, 4, 0, 0]} />
          <Bar dataKey="after" name={afterLabel} fill={chart.accent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
