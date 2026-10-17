import type { Car, CarModel, Catalog, OdometerReading, PartSpec, ServiceRecord, Settings } from './types'
import { addMonths, DAY } from './format'

export type PartState = 'overdue' | 'soon' | 'ok' | 'unknown' | 'untracked'

export interface PartStatus {
  part: PartSpec
  last?: ServiceRecord
  state: PartState
  /** 0..1+ share of the interval already used */
  progress: number
  dueKm?: number
  kmLeft?: number
  /** Predicted due date (earliest of the km- and time-based dates) */
  dueDate?: number
  /** dueDate came from the km/day estimate rather than the calendar */
  dueDateEstimated: boolean
}

export interface CarContext {
  car: Car
  model: CarModel
  parts: PartSpec[]
  readings: OdometerReading[]
  services: ServiceRecord[]
  settings: Settings
  now: number
}

export function findModel(catalog: Catalog, modelId: string): CarModel | undefined {
  return catalog.models.find((m) => m.id === modelId)
}

export function applicableParts(model: CarModel, car: Car): PartSpec[] {
  return model.parts.filter((p) => p.enabled !== false && (!p.transmission || p.transmission === car.transmission))
}

/** Latest known odometer value and when it was recorded */
export function latestKm(readings: OdometerReading[], services: ServiceRecord[]): { km: number; date: number } | undefined {
  let best: { km: number; date: number } | undefined
  for (const r of [...readings, ...services]) {
    if (!best || r.km > best.km || (r.km === best.km && r.date > best.date)) best = { km: r.km, date: r.date }
  }
  return best
}

/**
 * Average km driven per day, from odometer history (readings + service
 * visits). Uses up to the last 180 days so habits that change are picked up,
 * and falls back to the configured default until there is at least a week of
 * history.
 */
export function dailyKm(readings: OdometerReading[], services: ServiceRecord[], settings: Settings, now = Date.now()): number {
  const points = [...readings, ...services]
    .map((r) => ({ km: r.km, date: r.date }))
    .sort((a, b) => a.date - b.date)
  if (points.length < 2) return settings.defaultDailyKm
  const last = points[points.length - 1]
  const windowStart = Math.min(now, last.date) - 180 * DAY
  const first = points.find((p) => p.date >= windowStart) ?? points[0]
  const spanDays = (last.date - first.date) / DAY
  if (spanDays < 7 || last.km <= first.km) return settings.defaultDailyKm
  const v = (last.km - first.km) / spanDays
  return Math.min(500, Math.max(1, v))
}

export function estimateKmNow(ctx: CarContext): number {
  const latest = latestKm(ctx.readings, ctx.services)
  if (!latest) return 0
  const days = Math.max(0, (ctx.now - latest.date) / DAY)
  return Math.round(latest.km + days * dailyKm(ctx.readings, ctx.services, ctx.settings, ctx.now))
}

export function lastServiceFor(partId: string, services: ServiceRecord[]): ServiceRecord | undefined {
  let best: ServiceRecord | undefined
  for (const s of services) {
    if (s.partId !== partId) continue
    if (!best || s.date > best.date || (s.date === best.date && s.km > best.km)) best = s
  }
  return best
}

export function partStatus(part: PartSpec, ctx: CarContext): PartStatus {
  const last = lastServiceFor(part.id, ctx.services)
  const base = { part, last, progress: 0, dueDateEstimated: false }
  if (!part.intervalKm && !part.intervalMonths) return { ...base, state: 'untracked' }
  if (!last) return { ...base, state: 'unknown' }

  const latest = latestKm(ctx.readings, ctx.services) ?? { km: last.km, date: last.date }
  const perDay = dailyKm(ctx.readings, ctx.services, ctx.settings, ctx.now)

  let dueKm: number | undefined
  let kmLeft: number | undefined
  let dateByKm: number | undefined
  let progress = 0
  if (part.intervalKm) {
    dueKm = last.km + part.intervalKm
    kmLeft = dueKm - latest.km
    dateByKm = latest.date + (kmLeft / perDay) * DAY
    progress = Math.max(progress, (latest.km - last.km) / part.intervalKm)
  }

  let dateByTime: number | undefined
  if (part.intervalMonths) {
    dateByTime = addMonths(last.date, part.intervalMonths)
    progress = Math.max(progress, (ctx.now - last.date) / (dateByTime - last.date))
  }

  const dueDate = Math.min(dateByKm ?? Infinity, dateByTime ?? Infinity)
  const dueDateEstimated = dateByKm !== undefined && dateByKm === dueDate

  let state: PartState = 'ok'
  const daysLeft = (dueDate - ctx.now) / DAY
  if ((kmLeft !== undefined && kmLeft <= 0) || (dateByTime !== undefined && dateByTime <= ctx.now)) state = 'overdue'
  else {
    // Long intervals get a proportionally earlier heads-up (10% of the interval)
    const soonKm = Math.max(ctx.settings.soonKm, (part.intervalKm ?? 0) * 0.1)
    const soonDays = Math.max(ctx.settings.soonDays, (part.intervalMonths ?? 0) * 3)
    if ((kmLeft !== undefined && kmLeft <= soonKm) || daysLeft <= soonDays) state = 'soon'
  }

  return { ...base, state, progress, dueKm, kmLeft, dueDate, dueDateEstimated }
}

const STATE_ORDER: Record<PartState, number> = { overdue: 0, soon: 1, unknown: 2, ok: 3, untracked: 4 }

export function allStatuses(ctx: CarContext): PartStatus[] {
  return ctx.parts
    .map((p) => partStatus(p, ctx))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
}

/** 0..100 health score shown on the dashboard ring */
export function healthScore(statuses: PartStatus[]): number {
  const tracked = statuses.filter((s) => s.state !== 'untracked' && s.state !== 'unknown')
  if (!tracked.length) return 100
  let penalty = 0
  for (const s of tracked) {
    const weight = s.part.critical ? 2 : 1
    if (s.state === 'overdue') penalty += 3 * weight
    else if (s.state === 'soon') penalty += 1 * weight
  }
  const max = tracked.reduce((a, s) => a + 3 * (s.part.critical ? 2 : 1), 0)
  return Math.round(100 - (penalty / max) * 100)
}
