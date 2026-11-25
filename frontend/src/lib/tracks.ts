import type { AlbumDetail, Track } from '../types'

/** Album detail -> the Track shape used by the player queue. */
export function albumToTracks(album: AlbumDetail): Track[] {
  const artists = album.artists.map((a) => a.name).join(', ') || 'Unknown artist'
  return album.tracks.map((t) => ({
    track_id: t.track_id,
    title: t.title,
    duration_ms: t.duration_ms,
    album_id: album.album_id,
    album_title: album.title,
    artists,
    is_explicit: t.is_explicit,
  }))
}

export const yearOf = (date: string | null | undefined): string => (date ?? '').slice(0, 4)