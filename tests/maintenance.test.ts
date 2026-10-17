import { describe, expect, it } from 'vitest'
import { allStatuses, applicableParts, dailyKm, partStatus, type CarContext } from '../src/lib/maintenance'
import { buildSchedule, checkDays, checkDue, fluidCheckDates } from '../src/lib/schedule'
import { toICS } from '../src/lib/ics'
import { DEFAULT_CATALOG } from '../src/data/catalog'
import { DAY, fromJalali, jalali, parseNumber } from '../src/lib/format'
import { DEFAULT_SETTINGS, type Car } from '../src/lib/types'

const rana = DEFAULT_CATALOG.models.find((m) => m.id === 'runna-lx')!
const avante = DEFAULT_CATALOG.models.find((m) => m.id === 'avante-xd-20')!
const now = fromJalali(1405, 7, 25, 12)
const car: Car = { id: 1, name: 'رانا', modelId: rana.id, transmission: 'manual', createdAt: now }

function ctx(over: Partial<CarContext> = {}): CarContext {
  return { car, model: rana, parts: applicableParts(rana, car), readings: [], services: [], settings: DEFAULT_SETTINGS, now, ...over }
}

describe('catalog', () => {
  it('has unique part ids per model and sane intervals', () => {
    for (const m of DEFAULT_CATALOG.models) {
      const ids = m.parts.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const p of m.parts) {
        if (p.intervalKm) expect(p.intervalKm).toBeGreaterThanOrEqual(1000)
        if (p.intervalMonths) expect(p.intervalMonths).toBeGreaterThan(0)
      }
    }
  })

  it('filters parts by transmission', () => {
    const auto = applicableParts(avante, { ...car, modelId: avante.id, transmission: 'auto' }).map((p) => p.id)
    expect(auto).toContain('atf')
    expect(auto).not.toContain('clutch-kit')
    const manual = applicableParts(avante, { ...car, modelId: avante.id, transmission: 'manual' }).map((p) => p.id)
    expect(manual).toContain('clutch-kit')
    expect(manual).not.toContain('atf')
  })
})

describe('dailyKm', () => {
  it('falls back to the default with too little history', () => {
    expect(dailyKm([{ carId: 1, km: 1000, date: now }], [], DEFAULT_SETTINGS, now)).toBe(40)
  })
  it('averages over the history', () => {
    const readings = [
      { carId: 1, km: 10_000, date: now - 30 * DAY },
      { carId: 1, km: 11_500, date: now },
    ]
    expect(dailyKm(readings, [], DEFAULT_SETTINGS, now)).toBeCloseTo(50)
  })
})

describe('dailyKm with back-dated entries', () => {
  it('ignores approximate same-day records with a lower km', () => {
    const readings = [
      { carId: 1, km: 13_000, date: now - 30 * DAY },
      { carId: 1, km: 15_000, date: now },
    ]
    const services = [{ carId: 1, partId: 'engine-oil', km: 11_000, date: now }]
    expect(dailyKm(readings, services, DEFAULT_SETTINGS, now)).toBeCloseTo(66.67, 1)
  })
})

describe('partStatus', () => {
  const oil = rana.parts.find((p) => p.id === 'engine-oil')!
  it('is unknown without a record', () => {
    expect(partStatus(oil, ctx()).state).toBe('unknown')
  })
  it('is ok right after a change', () => {
    const s = partStatus(oil, ctx({ services: [{ carId: 1, partId: 'engine-oil', km: 100_000, date: now }] }))
    expect(s.state).toBe('ok')
    expect(s.dueKm).toBe(105_000)
  })
  it('is soon when within soonKm', () => {
    const s = partStatus(oil, ctx({ services: [{ carId: 1, partId: 'engine-oil', km: 100_000, date: now - 20 * DAY }], readings: [{ carId: 1, km: 104_500, date: now }] }))
    expect(s.state).toBe('soon')
    expect(s.kmLeft).toBe(500)
  })
  it('is overdue past the km interval', () => {
    const s = partStatus(oil, ctx({ services: [{ carId: 1, partId: 'engine-oil', km: 100_000, date: now - 20 * DAY }], readings: [{ carId: 1, km: 105_200, date: now }] }))
    expect(s.state).toBe('overdue')
  })
  it('is overdue past the time interval even with low km', () => {
    const s = partStatus(oil, ctx({ services: [{ carId: 1, partId: 'engine-oil', km: 100_000, date: now - 200 * DAY }], readings: [{ carId: 1, km: 101_000, date: now }] }))
    expect(s.state).toBe('overdue')
  })
  it('warns earlier for long intervals like the timing belt', () => {
    const belt = rana.parts.find((p) => p.id === 'timing-kit')!
    const s = partStatus(belt, ctx({ services: [{ carId: 1, partId: 'timing-kit', km: 70_000, date: now - 10 * DAY }], readings: [{ carId: 1, km: 125_000, date: now }] }))
    expect(s.kmLeft).toBe(5000)
    expect(s.state).toBe('soon')
  })
  it('sorts overdue first', () => {
    const list = allStatuses(ctx({ services: [{ carId: 1, partId: 'engine-oil', km: 1000, date: now - 400 * DAY }] }))
    expect(list[0].part.id).toBe('engine-oil')
  })
})

describe('fluid checks', () => {
  it('spreads checks evenly in the month', () => {
    expect(checkDays(2, 30)).toEqual([1, 16])
    expect(checkDays(4, 31)).toEqual([1, 8, 16, 24])
  })
  it('checks 4×/month in summer and 2×/month otherwise', () => {
    const tir = fromJalali(1405, 4, 1, 0)
    const summer = fluidCheckDates(tir - 1, fromJalali(1405, 4, 31, 23), { settings: DEFAULT_SETTINGS })
    expect(summer).toHaveLength(4)
    const mehr = fromJalali(1405, 7, 1, 0)
    const autumn = fluidCheckDates(mehr - 1, fromJalali(1405, 7, 30, 23), { settings: DEFAULT_SETTINGS })
    expect(autumn).toHaveLength(2)
    expect(autumn.map((t) => jalali(t).jd)).toEqual([1, 16])
  })
  it('knows when a check is due', () => {
    expect(checkDue([], DEFAULT_SETTINGS, now).due).toBe(true)
    expect(checkDue([{ carId: 1, date: now - DAY, items: [] }], DEFAULT_SETTINGS, now).due).toBe(false)
  })
})

describe('buildSchedule', () => {
  it('produces part, odometer, check and symptom reminders in order', () => {
    const r = buildSchedule({
      ...ctx({ services: [{ id: 5, carId: 1, partId: 'engine-oil', km: 100_000, date: now - 60 * DAY }], readings: [{ carId: 1, km: 103_000, date: now - DAY }] }),
      checks: [],
      symptoms: [{ id: 9, carId: 1, title: 'صدای ترمز', category: 'brake', severity: 2, date: now, status: 'open', remindAt: now + 3 * DAY }],
      horizonDays: 60,
    })
    const kinds = new Set(r.map((x) => x.kind))
    expect(kinds).toEqual(new Set(['check', 'part', 'odometer', 'symptom']))
    expect(r.every((x, i) => i === 0 || r[i - 1].at <= x.at)).toBe(true)
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length)
    expect(r.every((x) => x.at > now && x.at <= now + 60 * DAY)).toBe(true)
  })
})

describe('helpers', () => {
  it('parses Persian digits', () => {
    expect(parseNumber('۱۲۸,۵۰۰')).toBe(128500)
    expect(parseNumber('١٢٣')).toBe(123)
    expect(parseNumber('')).toBeUndefined()
  })
  it('emits folded CRLF iCalendar', () => {
    const ics = toICS([{ id: 'a', at: now, kind: 'check', title: 'چک دوره‌ای رانای من با یک عنوان نسبتاً طولانی برای تست', body: 'متن', url: '#/checks' }], 'https://x.github.io/CarCare/')
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(ics).toContain('BEGIN:VALARM')
  })
})
