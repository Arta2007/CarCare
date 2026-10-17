import Dexie, { type EntityTable } from 'dexie'
import type { Car, CarDocument, Catalog, CheckLog, FuelLog, OdometerReading, Photo, ServiceRecord, Settings, Symptom } from './types'
import { DEFAULT_SETTINGS } from './types'
import { DEFAULT_CATALOG } from '../data/catalog'

interface KV {
  key: string
  value: unknown
}

export const db = new Dexie('carcare') as Dexie & {
  cars: EntityTable<Car, 'id'>
  odometer: EntityTable<OdometerReading, 'id'>
  services: EntityTable<ServiceRecord, 'id'>
  symptoms: EntityTable<Symptom, 'id'>
  checks: EntityTable<CheckLog, 'id'>
  documents: EntityTable<CarDocument, 'id'>
  fuel: EntityTable<FuelLog, 'id'>
  photos: EntityTable<Photo, 'id'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  cars: '++id',
  odometer: '++id, carId, date',
  services: '++id, carId, partId, date, visitId',
  symptoms: '++id, carId, status, date',
  checks: '++id, carId, date',
  kv: 'key',
})

db.version(2).stores({
  documents: '++id, carId, expiresAt',
  fuel: '++id, carId, date',
  photos: '++id, [owner+ownerId]',
})

/** Tables that hold per-car records (deleted together with the car) */
export const CAR_TABLES = ['odometer', 'services', 'symptoms', 'checks', 'documents', 'fuel'] as const

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings()
  await db.kv.put({ key: 'settings', value: { ...cur, ...patch } })
}

/** The catalog lives in the DB once edited in the developer panel */
export async function getCatalog(): Promise<Catalog> {
  const row = await db.kv.get('catalog')
  return (row?.value as Catalog) ?? DEFAULT_CATALOG
}

export async function saveCatalog(catalog: Catalog): Promise<void> {
  await db.kv.put({ key: 'catalog', value: catalog })
}

export async function resetCatalog(): Promise<void> {
  await db.kv.delete('catalog')
}

const DATA_TABLES = ['cars', 'odometer', 'services', 'symptoms', 'checks', 'documents', 'fuel', 'kv'] as const

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

/** Everything, photos included (as data URLs), in one JSON file */
export async function exportAll(): Promise<string> {
  const out: Record<string, unknown> = { app: 'carcare', version: 2, exportedAt: Date.now() }
  for (const t of DATA_TABLES) out[t] = await db.table(t).toArray()
  const photos = await db.photos.toArray()
  out.photos = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })))
  return JSON.stringify(out)
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json)
  if (data?.app !== 'carcare') throw new Error('فایل پشتیبان معتبر نیست')
  // Decode photos before the transaction: IndexedDB transactions can't span awaits on fetch
  const photos = await Promise.all(((data.photos ?? []) as (Photo & { blob: string })[]).map(async (p) => ({ ...p, blob: await dataUrlToBlob(p.blob) })))
  const tables = [...DATA_TABLES.map((t) => db.table(t)), db.photos]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    for (const t of DATA_TABLES) await db.table(t).bulkAdd(data[t] ?? [])
    await db.photos.bulkAdd(photos)
  })
}

/** Deletes a car with all of its records and their photos */
export async function deleteCar(carId: number): Promise<void> {
  const tables = [db.cars, db.photos, ...CAR_TABLES.map((t) => db.table(t))]
  await db.transaction('rw', tables, async () => {
    for (const [table, owner] of [['services', 'service'], ['symptoms', 'symptom'], ['documents', 'document'], ['fuel', 'fuel']] as const) {
      const ids = (await db.table(table).where('carId').equals(carId).primaryKeys()) as number[]
      for (const id of ids) await db.photos.where('[owner+ownerId]').equals([owner, id]).delete()
    }
    for (const t of CAR_TABLES) await db.table(t).where('carId').equals(carId).delete()
    await db.cars.delete(carId)
  })
}
