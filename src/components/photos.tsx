import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { db } from '../lib/db'
import type { PhotoOwner } from '../lib/types'

export interface PhotoItem {
  id?: number
  blob: Blob
}

const MAX_SIDE = 1600

/** Downscales camera photos (often 4–12 MB) to a ~300 KB JPEG before storing */
export async function compressImage(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
    return out ?? file
  } catch {
    return file
  }
}

export async function loadPhotos(owner: PhotoOwner, ownerId: number): Promise<PhotoItem[]> {
  return db.photos.where('[owner+ownerId]').equals([owner, ownerId]).toArray()
}

/** Makes the stored photos for a record match `items` (adds new, removes dropped) */
export async function savePhotos(owner: PhotoOwner, ownerId: number, items: PhotoItem[]): Promise<void> {
  const existing = await loadPhotos(owner, ownerId)
  const keep = new Set(items.filter((i) => i.id).map((i) => i.id))
  await db.photos.bulkDelete(existing.filter((e) => !keep.has(e.id)).map((e) => e.id!))
  await db.photos.bulkAdd(items.filter((i) => !i.id).map((i) => ({ owner, ownerId, blob: i.blob, createdAt: Date.now() })))
}

export async function deletePhotos(owner: PhotoOwner, ownerId: number): Promise<void> {
  await db.photos.where('[owner+ownerId]').equals([owner, ownerId]).delete()
}

function useObjectUrls(items: PhotoItem[]): string[] {
  const urls = useMemo(() => items.map((i) => URL.createObjectURL(i.blob)), [items])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

/** Editable photo row for forms; the caller saves with savePhotos() */
export function PhotoPicker({ value, onChange, label = 'عکس (فاکتور، محل خرابی، …)' }: { value: PhotoItem[]; onChange: (v: PhotoItem[]) => void; label?: string }) {
  const urls = useObjectUrls(value)
  const [viewer, setViewer] = useState<number | null>(null)

  async function add(files: FileList | null) {
    if (!files?.length) return
    const blobs = await Promise.all([...files].map(compressImage))
    onChange([...value, ...blobs.map((blob) => ({ blob }))])
  }

  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        <label className="grid size-20 shrink-0 cursor-pointer place-items-center rounded-xl bg-surface text-muted ring-1 ring-line ring-dashed active:bg-surface-2">
          <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
            <Camera className="size-6" />
            افزودن
          </span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
        {urls.map((u, i) => (
          <div key={u} className="relative size-20 shrink-0">
            <button type="button" onClick={() => setViewer(i)} className="size-full overflow-hidden rounded-xl ring-1 ring-line">
              <img src={u} alt="" className="size-full object-cover" />
            </button>
            <button type="button" aria-label="حذف عکس" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-danger text-white shadow">
              <X className="size-3.5" strokeWidth={3} />
            </button>
          </div>
        ))}
      </div>
      {viewer !== null && <PhotoViewer urls={urls} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

/** Read-only thumbnails for a saved record */
export function PhotoStrip({ owner, ownerId }: { owner: PhotoOwner; ownerId: number }) {
  const items = useLiveQuery(() => loadPhotos(owner, ownerId), [owner, ownerId], [] as PhotoItem[])
  const urls = useObjectUrls(items)
  const [viewer, setViewer] = useState<number | null>(null)
  if (!urls.length) return null
  return (
    <>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {urls.map((u, i) => (
          <button key={u} onClick={(e) => { e.stopPropagation(); setViewer(i) }} className="size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
            <img src={u} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {viewer !== null && <PhotoViewer urls={urls} index={viewer} onClose={() => setViewer(null)} />}
    </>
  )
}

export function usePhotoCount(owner: PhotoOwner, ownerId?: number): number {
  return useLiveQuery(() => (ownerId ? db.photos.where('[owner+ownerId]').equals([owner, ownerId]).count() : 0), [owner, ownerId], 0)
}

function PhotoViewer({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  return (
    <div className="animate-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/95" onClick={onClose} role="dialog" aria-modal="true">
      <img src={urls[i]} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button aria-label="بستن" onClick={onClose} className="absolute end-4 grid size-10 place-items-center rounded-full bg-white/15 text-white" style={{ top: 'max(env(safe-area-inset-top), 16px)' }}>
        <X className="size-6" />
      </button>
      {urls.length > 1 && (
        <>
          <button aria-label="بعدی" onClick={(e) => { e.stopPropagation(); setI((i + 1) % urls.length) }} className="absolute start-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronRight className="size-6" /></button>
          <button aria-label="قبلی" onClick={(e) => { e.stopPropagation(); setI((i - 1 + urls.length) % urls.length) }} className="absolute end-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white"><ChevronLeft className="size-6" /></button>
          <span className="absolute inset-x-0 bottom-8 text-center text-sm text-white/70">{i + 1} / {urls.length}</span>
        </>
      )}
    </div>
  )
}
