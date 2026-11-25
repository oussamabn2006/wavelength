import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import type { Track } from '../types'

/** The user's latest distinct plays (from Cassandra), resolved to full tracks. */
export function useRecentlyPlayed(userId: number, limit = 30) {
  return useQuery({
    queryKey: ['recent', userId, limit],
    staleTime: 10_000,
    queryFn: async (): Promise<Track[]> => {
      const items = await api.history(userId, limit)
      const seen = new Set<number>()
      const unique = items.filter((it) => !seen.has(it.track_id) && seen.add(it.track_id))
      const details = await Promise.all(unique.slice(0, 24).map((it) => api.getTrack(it.track_id).catch(() => null)))
      return details.filter((t): t is Track => t !== null)
    },
  })
}