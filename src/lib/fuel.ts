import type { FuelLog } from './types'
import { jalali } from './format'

export interface FuelSegment {
  /** Fill-up that closes the segment */
  end: FuelLog
  km: number
  liters: number
  /** Litres per 100 km */
  consumption: number
}

/**
 * Consumption is only exact between two full tanks: all litres added after
 * the first full fill (partials included) were burnt over that distance.
 */
export function fuelSegments(logs: FuelLog[]): FuelSegment[] {
  const sorted = [...logs].sort((a, b) => a.km - b.km || a.date - b.date)
  const out: FuelSegment[] = []
  let start: FuelLog | undefined
  let liters = 0
  for (const f of sorted) {
    if (!start) {
      if (f.full) start = f
      continue
    }
    liters += f.liters
    if (f.full) {
      const km = f.km - start.km
      if (km > 0) out.push({ end: f, km, liters, consumption: (liters / km) * 100 })
      start = f
      liters = 0
    }
  }
  return out
}

export interface FuelStats {
  avg?: number
  last?: number
  litersThisMonth: number
  costThisMonth: number
  totalCost: number
  /** Toman per km, from fills with a cost over the logged distance */
  costPerKm?: number
}

export function fuelStats(logs: FuelLog[], now = Date.now()): FuelStats {
  const segs = fuelSegments(logs)
  const km = segs.reduce((a, s) => a + s.km, 0)
  const liters = segs.reduce((a, s) => a + s.liters, 0)
  const { jy, jm } = jalali(now)
  const month = logs.filter((f) => {
    const j = jalali(f.date)
    return j.jy === jy && j.jm === jm
  })
  const totalCost = logs.reduce((a, f) => a + (f.cost ?? 0), 0)
  const kms = logs.map((f) => f.km)
  const span = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0
  // The first fill's cost bought fuel for the distance before it, so leave it out
  const first = [...logs].sort((a, b) => a.km - b.km)[0]
  const costAfterFirst = totalCost - (first?.cost ?? 0)
  return {
    avg: km > 0 ? (liters / km) * 100 : undefined,
    last: segs.at(-1)?.consumption,
    litersThisMonth: month.reduce((a, f) => a + f.liters, 0),
    costThisMonth: month.reduce((a, f) => a + (f.cost ?? 0), 0),
    totalCost,
    costPerKm: span > 0 && costAfterFirst > 0 ? costAfterFirst / span : undefined,
  }
}
