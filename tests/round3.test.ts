import { describe, expect, it } from 'vitest'
import { applicableParts } from '../src/lib/maintenance'
import { activeWarranties, learnedIntervals, oilConsumption, relatedPartIds } from '../src/lib/insights'
import { buildForecast } from '../src/lib/forecast'
import { calendarReminders } from '../src/lib/schedule'
import { monthSummary, summaryText } from '../src/lib/summary'
import { DEFAULT_CATALOG } from '../src/data/catalog'
import { BUILTIN_BUNDLES } from '../src/data/extras'
import { DAY, fromJalali, jalali } from '../src/lib/format'
import { DEFAULT_SETTINGS, type Car, type ServiceRecord } from '../src/lib/types'
import type { ActiveCar } from '../src/lib/store'

const now = fromJalali(1405, 7, 25, 12)
const model = DEFAULT_CATALOG.models.find((m) => m.id === 'avante-xd-20')!
const car: Car = { id: 1, name: 'آوانته', modelId: model.id, transmission: 'auto', createdAt: now }

function data(over: Partial<ActiveCar> = {}): ActiveCar {
  return { car, model, parts: applicableParts(model, car), readings: [], odometer: [], services: [], checks: [], symptoms: [], documents: [], fuel: [], oil: [], settings: DEFAULT_SETTINGS, now, ...over }
}
const svc = (partId: string, km: number, daysAgo: number, extra: Partial<ServiceRecord> = {}): ServiceRecord => ({ carId: 1, partId, km, date: now - daysAgo * DAY, ...extra })

describe('oil consumption', () => {
  it('computes litres per 1000 km since the last change', () => {
    const d = data({ services: [svc('engine-oil', 200_000, 40)], readings: [{ carId: 1, km: 202_000, date: now }] })
    const c = oilConsumption(d, [{ carId: 1, km: 201_000, liters: 0.5, date: now - 10 * DAY }, { carId: 1, km: 199_000, liters: 1, date: now - 60 * DAY }])
    expect(c.perThousand).toBeCloseTo(0.25)
    expect(c.level).toBe('normal')
  })
  it('flags heavy burning', () => {
    const d = data({ services: [svc('engine-oil', 200_000, 40)], readings: [{ carId: 1, km: 201_000, date: now }] })
    expect(oilConsumption(d, [{ carId: 1, km: 200_800, liters: 1, date: now }]).level).toBe('high')
  })
})

describe('learned intervals', () => {
  it('suggests a shorter interval when parts wear out early', () => {
    const d = data({ services: [svc('front-pads', 100_000, 600), svc('front-pads', 118_000, 300), svc('front-pads', 137_000, 10)] })
    const l = learnedIntervals(d)
    expect(l).toHaveLength(1)
    expect(l[0].part.id).toBe('front-pads')
    expect(l[0].suggestedKm).toBe(18_500)
  })
  it('stays quiet when real life matches the interval', () => {
    expect(learnedIntervals(data({ services: [svc('front-pads', 100_000, 600), svc('front-pads', 129_000, 10)] }))).toHaveLength(0)
  })
})

describe('symptom hints', () => {
  it('maps keywords before categories', () => {
    expect(relatedPartIds({ title: 'جیرجیر ترمز', category: 'sound' })).toContain('front-pads')
    expect(relatedPartIds({ title: 'ضربه هنگام دنده', category: 'sound' })).toContain('atf')
    expect(relatedPartIds({ title: 'چیز عجیب', category: 'ac' })).toEqual(['ac-service', 'cabin-filter'])
  })
})

describe('warranty', () => {
  it('lists only unexpired warranties', () => {
    const d = data({ services: [svc('battery', 1, 100, { id: 1, warrantyMonths: 12 }), svc('tires', 1, 800, { id: 2, warrantyMonths: 12 })] })
    expect(activeWarranties(d).map((w) => w.record.id)).toEqual([1])
  })
})

describe('forecast', () => {
  it('repeats short intervals and applies inflation', () => {
    const d = data({ services: [svc('engine-oil', 200_000, 10)], readings: [{ carId: 1, km: 200_000, date: now - 10 * DAY }, { carId: 1, km: 200_500, date: now }] })
    const flat = buildForecast(d, 12, 0)
    const oil = flat.items.filter((i) => i.partId === 'engine-oil')
    expect(oil.length).toBeGreaterThanOrEqual(2)
    expect(oil[0].cost).toBe(model.parts.find((p) => p.id === 'engine-oil')!.price)
    expect(buildForecast(d, 12, 3).total).toBeGreaterThan(flat.total)
    expect(flat.unknownParts).toBeGreaterThan(0)
  })
})

describe('calendar reminders', () => {
  it('schedules the monthly summary on the 1st and seasonal tips on their day', () => {
    const r = calendarReminders(now, 60, 10)
    const summary = r.filter((x) => x.kind === 'summary')
    expect(summary.length).toBe(2)
    expect(summary.every((x) => jalali(x.at).jd === 1)).toBe(true)
    const winter = r.find((x) => x.id.startsWith('season-1405-winter'))!
    expect(jalali(winter.at)).toMatchObject({ jm: 8, jd: 20 })
  })
})

describe('monthly summary', () => {
  it('interpolates distance across month boundaries and sums costs', () => {
    const start = fromJalali(1405, 6, 1, 12)
    const d = data({
      now,
      readings: [{ carId: 1, km: 10_000, date: start - 10 * DAY }, { carId: 1, km: 12_000, date: start + 40 * DAY }],
      services: [svc('engine-oil', 11_000, 0, { date: start + 5 * DAY, cost: 2_000_000 })],
      fuel: [{ carId: 1, km: 10_500, liters: 30, full: true, cost: 900_000, date: start + 2 * DAY }],
    })
    const s = monthSummary(d, 1405, 6)
    expect(s.km).toBeGreaterThan(1000)
    expect(s.serviceCost).toBe(2_000_000)
    expect(s.fuelLiters).toBe(30)
    expect(summaryText('آوانته', s)).toContain('شهریور')
  })
})

describe('bundles', () => {
  it('only reference real catalog parts', () => {
    const all = new Set(DEFAULT_CATALOG.models.flatMap((m) => m.parts.map((p) => p.id)))
    for (const b of BUILTIN_BUNDLES) for (const id of b.partIds) expect(all.has(id)).toBe(true)
  })
})

