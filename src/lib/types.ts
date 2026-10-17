export type Transmission = 'manual' | 'auto'

export type CategoryId =
  | 'engine'
  | 'filters'
  | 'ignition'
  | 'timing'
  | 'transmission'
  | 'brakes'
  | 'cooling'
  | 'suspension'
  | 'tires'
  | 'electrical'
  | 'body'

export interface PartSpec {
  id: string
  name: string
  category: CategoryId
  /** Replace every N km (undefined = time-based only) */
  intervalKm?: number
  /** Replace every N months (undefined = km-based only) */
  intervalMonths?: number
  /** Approximate part + labour cost in Toman */
  price?: number
  note?: string
  /** Only applies to cars with this transmission */
  transmission?: Transmission
  /** Engine damage risk if skipped — shown with extra emphasis */
  critical?: boolean
  enabled?: boolean
}

export interface CarModel {
  id: string
  name: string
  engine: string
  defaultTransmission: Transmission
  transmissions: Transmission[]
  /** Fluid capacities / specs shown on the model info card */
  specs: { label: string; value: string }[]
  parts: PartSpec[]
}

export interface Catalog {
  version: number
  /** Jalali date the prices were estimated */
  priceDate: string
  models: CarModel[]
}

export interface Car {
  id?: number
  name: string
  modelId: string
  year?: number
  transmission: Transmission
  plate?: string
  createdAt: number
}

export interface OdometerReading {
  id?: number
  carId: number
  km: number
  date: number
}

export interface ServiceRecord {
  id?: number
  carId: number
  partId: string
  km: number
  date: number
  cost?: number
  brand?: string
  shop?: string
  notes?: string
  /** Groups parts logged in one visit (e.g. oil + oil filter) */
  visitId?: string
}

export type SymptomCategory =
  | 'sound'
  | 'vibration'
  | 'leak'
  | 'warning'
  | 'smell'
  | 'smoke'
  | 'brake'
  | 'steering'
  | 'electrical'
  | 'ac'
  | 'other'

export interface Symptom {
  id?: number
  carId: number
  title: string
  description?: string
  category: SymptomCategory
  severity: 1 | 2 | 3
  date: number
  km?: number
  status: 'open' | 'resolved'
  remindAt?: number
  resolvedAt?: number
  resolution?: string
}

export interface CheckLog {
  id?: number
  carId: number
  date: number
  /** Ids of checklist items that were checked */
  items: string[]
  notes?: string
}

export interface Settings {
  activeCarId?: number
  notifyHour: number
  /** Jalali months (1-12) considered summer for the fluid-check cadence */
  summerMonths: number[]
  checksPerMonthSummer: number
  checksPerMonthNormal: number
  /** Days between odometer prompts when nothing is close to due */
  odometerPromptDays: number
  /** Days between odometer prompts when something is close to due */
  odometerPromptDaysUrgent: number
  /** A part counts as "due soon" within this many km ... */
  soonKm: number
  /** ... or this many days */
  soonDays: number
  /** Used until enough odometer history exists */
  defaultDailyKm: number
  /** Days after logging a symptom before the first follow-up */
  symptomFollowupDays: number
  /** Days between "make a backup" reminders */
  backupReminderDays: number
  lastBackupAt?: number
  developer: boolean
  /** Optional self-hosted Web Push relay (see worker/) */
  pushServer?: string
  lastPushSync?: number
}

export const DEFAULT_SETTINGS: Settings = {
  notifyHour: 10,
  summerMonths: [4, 5, 6],
  checksPerMonthSummer: 4,
  checksPerMonthNormal: 2,
  odometerPromptDays: 14,
  odometerPromptDaysUrgent: 7,
  soonKm: 1000,
  soonDays: 21,
  defaultDailyKm: 40,
  symptomFollowupDays: 3,
  backupReminderDays: 14,
  developer: false,
}
