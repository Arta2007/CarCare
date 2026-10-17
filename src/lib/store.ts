import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCatalog, getSettings, updateSettings } from './db'
import { applicableParts, findModel, type CarContext } from './maintenance'
import type { Car, CarDocument, CheckLog, FuelLog, OdometerReading, Symptom } from './types'
import { DEFAULT_SETTINGS } from './types'
import { DEFAULT_CATALOG } from '../data/catalog'
import { backupReminders, buildSchedule, type Reminder } from './schedule'

export function useSettings() {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
}

export function useCatalog() {
  return useLiveQuery(getCatalog, [], DEFAULT_CATALOG)
}

export function useCars() {
  return useLiveQuery(() => db.cars.toArray(), [], undefined)
}

export interface ActiveCar extends CarContext {
  /** Raw odometer entries (readings also includes fuel-up km for estimates) */
  odometer: OdometerReading[]
  checks: CheckLog[]
  symptoms: Symptom[]
  documents: CarDocument[]
  fuel: FuelLog[]
}

async function loadCarData(car: Car): Promise<ActiveCar | null> {
  const id = car.id!
  const [catalog, settings, odometer, services, checks, symptoms, documents, fuel] = await Promise.all([
    getCatalog(),
    getSettings(),
    db.odometer.where('carId').equals(id).toArray(),
    db.services.where('carId').equals(id).toArray(),
    db.checks.where('carId').equals(id).toArray(),
    db.symptoms.where('carId').equals(id).toArray(),
    db.documents.where('carId').equals(id).toArray(),
    db.fuel.where('carId').equals(id).toArray(),
  ])
  const model = findModel(catalog, car.modelId)
  if (!model) return null
  const readings = [...odometer, ...fuel.map((f) => ({ carId: id, km: f.km, date: f.date }))]
  return { car, model, parts: applicableParts(model, car), readings, odometer, services, checks, symptoms, documents, fuel, settings, now: Date.now() }
}

/** Everything the screens need for the selected car, kept live with IndexedDB */
export function useActiveCar(): ActiveCar | null | undefined {
  return useLiveQuery(async () => {
    const settings = await getSettings()
    const cars = await db.cars.toArray()
    if (!cars.length) return null
    const car = cars.find((c) => c.id === settings.activeCarId) ?? cars[0]
    return loadCarData(car)
  }, [])
}

export async function setActiveCar(id: number) {
  await updateSettings({ activeCarId: id })
}

/** Upcoming reminders for every car plus backup reminders */
export async function allReminders(horizonDays: number): Promise<Reminder[]> {
  const settings = await getSettings()
  const now = Date.now()
  const out: Reminder[] = []
  for (const car of await db.cars.toArray()) {
    const data = await loadCarData(car)
    if (data) out.push(...buildSchedule({ ...data, now, horizonDays }))
  }
  out.push(...backupReminders(settings.lastBackupAt, settings.backupReminderDays, settings.notifyHour, now, horizonDays))
  return out.sort((a, b) => a.at - b.at)
}

export function newVisitId(): string {
  return Math.random().toString(36).slice(2, 10)
}
