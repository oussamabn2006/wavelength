import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../services/api'
import type { UploadResult } from '../types'
import { PageTitle, Panel } from '../components/common/Panel'
import { btnCls, inputCls } from '../lib/ui'

type Kind = 'audio' | 'cover'

export default function Media() {
  const qc = useQueryClient()
  const [kind, setKind] = useState<Kind>('audio')
  const [id, setId] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [pct, setPct] = useState(0)
  const [drag, setDrag] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const playable = useQuery({ queryKey: ['playable'], queryFn: () => api.playableTracks(50) })

  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file first')
      setPct(0); setResult(null); setPreview(null)
      const mime = file.type || (kind === 'audio' ? 'audio/mpeg' : 'image/jpeg')
      const r = kind === 'audio' ? await api.uploadAudio(id, file, mime, setPct) : await api.uploadCover(id, file, mime, setPct)
      const u = kind === 'audio' ? (await api.audioUrl(id)).url : (await api.coverUrl(id)).url
      setPreview(u)
      return r
    },
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['playable'] }) },
  })

  return (
    <div>
      <PageTitle title="Media management" subtitle="Files go through the API into MinIO (S3-compatible object storage). Playback uses presigned URLs that expire; PostgreSQL stores only the object key." />
      <Panel title="Upload">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setFile(null) }} className={inputCls}>
            <option value="audio" className="bg-surface">Track audio</option>
            <option value="cover" className="bg-surface">Album cover</option>
          </select>
          <label>{kind === 'audio' ? 'Track ID' : 'Album ID'}
            <input type="number" min={1} value={id} onChange={(e) => setId(Number(e.target.value) || 1)} className={`${inputCls} ml-2 w-28`} />
          </label>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] ?? null) }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center text-sm ${drag ? 'border-accent bg-accent/10' : 'border-white/20'}`}>
          <p className="font-semibold">{file ? file.name : 'Drop a file here or click to browse'}</p>
          {file && <p className="mt-1 text-xs text-muted">{(file.size / 1048576).toFixed(2)} MB</p>}
          <input ref={input} type="file" hidden accept={kind === 'audio' ? 'audio/*' : 'image/*'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button className={btnCls} disabled={!file || up.isPending} onClick={() => up.mutate()}>{up.isPending ? 'Uploading...' : 'Upload'}</button>
          {(up.isPending || pct > 0) && (
            <div className="h-2 flex-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          )}
        </div>
        {up.isError && <p className="mt-3 text-sm text-red-300">{up.error.message}</p>}
        {result && (
          <div className="mt-4 rounded-md bg-surface-2 p-4 text-sm">
            <p className="font-bold text-accent">Stored in MinIO</p>
            <p className="text-muted">{result.bucket}/{result.object_key} - {result.content_type} - {(result.size_bytes / 1048576).toFixed(2)} MB</p>
            {preview && kind === 'audio' && <audio controls src={preview} className="mt-3 w-full" />}
            {preview && kind === 'cover' && <img src={preview} alt="cover" className="mt-3 h-40 w-40 rounded object-cover" />}
          </div>
        )}
      </Panel>

      <Panel className="mt-4" title="Playable tracks" hint="Tracks that have an audio object in MinIO.">
        {playable.isError && <p className="text-sm text-red-300">{playable.error.message}</p>}
        {playable.data && playable.data.length === 0 && <p className="text-sm text-muted">None yet. Upload an MP3 above.</p>}
        <ul className="divide-y divide-white/10 text-sm">
          {(playable.data ?? []).map((t) => (
            <li key={t.track_id} className="flex justify-between py-2">
              <span><span className="font-semibold">{t.title}</span> <span className="text-muted">- {t.artists}</span></span>
              <span className="text-muted">#{t.track_id}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
