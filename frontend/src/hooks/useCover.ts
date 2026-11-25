import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../services/api'

/** Presigned cover URL for an album, or null when the album has no cover uploaded. */
export function useCover(albumId?: number | null) {
  return useQuery({
    queryKey: ['cover', albumId],
    queryFn: async () => {
      try {
        return (await api.coverUrl(albumId as number)).url
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
    enabled: albumId != null && albumId > 0,
    staleTime: 25 * 60 * 1000, // presigned URLs last 1 hour
    gcTime: 60 * 60 * 1000,
    retry: false,
  })
}