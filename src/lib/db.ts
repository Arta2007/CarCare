import Dexie, { type EntityTable } from 'dexie'
import type { Car, Catalog, CheckLog, OdometerReading, ServiceRecord, Settings, Symptom } from './types'
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

export async function exportAll(): Promise<string> {
  const [cars, odometer, services, symptoms, checks, kv] = await Promise.all([
    db.cars.toArray(),
    db.odometer.toArray(),
    db.services.toArray(),
    db.symptoms.toArray(),
    db.checks.toArray(),
    db.kv.toArray(),
  ])
  return JSON.stringify({ app: 'carcare', version: 1, exportedAt: Date.now(), cars, odometer, services, symptoms, checks, kv }, null, 2)
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json)
  if (data?.app !== 'carcare') throw new Error('فایل پشتیبان معتبر نیست')
  await db.transaction('rw', [db.cars, db.odometer, db.services, db.symptoms, db.checks, db.kv], async () => {
    await Promise.all([db.cars.clear(), db.odometer.clear(), db.services.clear(), db.symptoms.clear(), db.checks.clear(), db.kv.clear()])
    await db.cars.bulkAdd(data.cars ?? [])
    await db.odometer.bulkAdd(data.odometer ?? [])
    await db.services.bulkAdd(data.services ?? [])
    await db.symptoms.bulkAdd(data.symptoms ?? [])
    await db.checks.bulkAdd(data.checks ?? [])
    await db.kv.bulkAdd(data.kv ?? [])
  })
}
