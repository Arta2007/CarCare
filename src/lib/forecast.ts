import type { CarDocument, FuelLog } from './types'
import { allStatuses, dailyKm, type CarContext } from './maintenance'
import { currentDocuments, docName } from './documents'
import { addMonths, DAY } from './format'

export interface ForecastItem {
  key: string
  name: string
  date: number
  cost: number
  kind: 'part' | 'document' | 'fuel'
  partId?: string
}

export interface Forecast {
  items: ForecastItem[]
  total: number
  /** Parts with no history, so their cost is unknown */
  unknownParts: number
}

/**
 * Expected spending over the next `months`: every part replacement that falls
 * due (repeating for short intervals), document renewals and fuel at the
 * recent monthly rate. Prices rise by `inflation`% per month from today.
 */
export function buildForecast(ctx: CarContext & { documents: CarDocument[]; fuel: FuelLog[] }, months: number, inflation: number): Forecast {
  const now = ctx.now
  const end = addMonths(now, months)
  const perDay = dailyKm(ctx.readings, ctx.services, ctx.settings, now)
  const inflate = (cost: number, at: number) => cost * Math.pow(1 + inflation / 100, Math.max(0, (at - now) / (30.44 * DAY)))
  const items: ForecastItem[] = []
  let unknownParts = 0

  for (const s of allStatuses(ctx)) {
    if (s.state === 'unknown') {
      if (s.part.price) unknownParts++
      continue
    }
    if (!s.dueDate || !s.part.price) continue
    // Repeat period in days: the sooner of the km- and time-based intervals
    const periods = [s.part.intervalKm ? s.part.intervalKm / perDay : Infinity, s.part.intervalMonths ? s.part.intervalMonths * 30.44 : Infinity]
    const every = Math.min(...periods) * DAY
    let at = Math.max(s.dueDate, now)
    for (let i = 0; at <= end && i < 24; i++, at += every) {
      items.push({ key: `${s.part.id}-${i}`, name: s.part.name, date: at, cost: inflate(s.part.price, at), kind: 'part', partId: s.part.id })
      if (!Number.isFinite(every)) break
    }
  }

  for (const d of currentDocuments(ctx.documents)) {
    if (!d.cost || d.expiresAt > end) continue
    const at = Math.max(d.expiresAt, now)
    items.push({ key: `doc-${d.id}`, name: `تمدید ${docName(d)}`, date: at, cost: inflate(d.cost, at), kind: 'document' })
  }

  // Fuel at the average monthly spend of the last 90 days
  const recent = ctx.fuel.filter((f) => f.cost && f.date > now - 90 * DAY)
  if (recent.length >= 2) {
    const span = Math.max(30, (now - Math.min(...recent.map((f) => f.date))) / DAY)
    const monthly = (recent.reduce((a, f) => a + f.cost!, 0) / span) * 30.44
    for (let m = 0; m < months; m++) {
      const at = addMonths(now, m + 1)
      items.push({ key: `fuel-${m}`, name: 'سوخت (بر اساس ۳ ماه اخیر)', date: at, cost: inflate(monthly, at), kind: 'fuel' })
    }
  }

  items.sort((a, b) => a.date - b.date)
  return { items, total: items.reduce((a, i) => a + i.cost, 0), unknownParts }
}
