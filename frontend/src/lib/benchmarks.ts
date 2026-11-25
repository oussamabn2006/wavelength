/** Results measured on this project's full dataset (second-run timings; raw output in docs/benchmarks/). */
export interface BenchRow {
  short: string
  name: string
  before: number
  after: number
  note: string
}

export const PG_BENCH: BenchRow[] = [
  { short: 'Q1', name: 'Top 10 tracks of the month', before: 14.102, after: 1.066,
    note: 'B-tree index on (stat_month, play_count DESC): no sort needed' },
  { short: 'Q2', name: 'Track title search (ILIKE)', before: 30.77, after: 0.381,
    note: 'GIN trigram index (pg_trgm) replaces a sequential scan over 100k titles' },
  { short: 'Q3', name: 'Top 10 artists (live aggregation)', before: 52.543, after: 51.809,
    note: 'Indexes barely help: the join and aggregation dominate' },
  { short: 'Q3 MV', name: 'Top 10 artists via materialized view', before: 51.809, after: 0.024,
    note: 'Pre-aggregated; needs REFRESH MATERIALIZED VIEW when statistics change' },
]

export const CQL_BENCH: BenchRow[] = [
  { short: 'Q1', name: 'User history (partition read)', before: 2.306, after: 1.302,
    note: 'Does not use the new index: the difference is measurement noise' },
  { short: 'Q2', name: 'Monthly play counter (partition read)', before: 1.256, after: 1.002,
    note: 'Does not use the new index: the difference is measurement noise' },
  { short: 'Q3', name: 'Find plays by track_id (SAI index)', before: 1.256, after: 4.146,
    note: 'SAI was slower for this workload: secondary indexes add overhead and are not automatically beneficial' },
]

export const REDIS_BENCH: BenchRow[] = [
  { short: 'Artists', name: 'top-artists (live aggregation)', before: 42.03, after: 12.31,
    note: 'API latency, average of 30 calls. The most expensive query gains the most' },
  { short: 'Tracks', name: 'top-tracks', before: 10.65, after: 7.19,
    note: 'Cheap query: small gain' },
  { short: 'Detail', name: 'track detail (joins)', before: 11.4, after: 6.04,
    note: 'Cheap query: small gain. Hit ratio during the run: 96.8%' },
]

export const DATASET: [string, string][] = [
  ['Artists', '2,000'],
  ['Albums', '10,000'],
  ['Tracks', '100,000'],
  ['Users', '10,000'],
  ['Monthly track statistics', '600,000'],
  ['Cassandra listening events', '501,606'],
  ['Cassandra playlists', '2,020'],
]
