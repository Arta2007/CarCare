import { describe, expect, it } from 'vitest'
import { fuelSegments, fuelStats } from '../src/lib/fuel'
import { imagesToPdf } from '../src/lib/pdf'
import { currentDocuments, docUrgency } from '../src/lib/documents'
import { buildSchedule } from '../src/lib/schedule'
import { applicableParts } from '../src/lib/maintenance'
import { DEFAULT_CATALOG } from '../src/data/catalog'
import { DAY, fromJalali } from '../src/lib/format'
import { DEFAULT_SETTINGS, type Car, type FuelLog } from '../src/lib/types'

const now = fromJalali(1405, 7, 25, 12)

describe('fuel', () => {
  const f = (km: number, liters: number, full: boolean, cost?: number): FuelLog => ({ carId: 1, km, liters, full, date: now - (10_000 - km) * 1000, cost })

  it('measures consumption between full tanks, counting partial fills in between', () => {
    const segs = fuelSegments([f(1000, 40, true), f(1200, 10, false), f(1500, 30, true)])
    expect(segs).toHaveLength(1)
    expect(segs[0].km).toBe(500)
    expect(segs[0].consumption).toBeCloseTo(8)
  })

  it('ignores fills before the first full tank', () => {
    expect(fuelSegments([f(900, 20, false), f(1000, 40, true), f(1400, 36, true)])[0].consumption).toBeCloseTo(9)
  })

  it('summarises averages and cost per km', () => {
    const s = fuelStats([f(1000, 40, true, 60_000), f(1500, 40, true, 60_000), f(2000, 50, true, 75_000)], now)
    expect(s.avg).toBeCloseTo(9)
    expect(s.last).toBeCloseTo(10)
    expect(s.costPerKm).toBeCloseTo(135)
  })
})

describe('documents', () => {
  const docs = [
    { id: 1, carId: 1, type: 'insurance' as const, expiresAt: now - 300 * DAY },
    { id: 2, carId: 1, type: 'insurance' as const, expiresAt: now + 20 * DAY },
    { id: 3, carId: 1, type: 'inspection' as const, expiresAt: now + 200 * DAY },
  ]
  it('keeps only the newest document per type', () => {
    expect(currentDocuments(docs).map((d) => d.id)).toEqual([2, 3])
  })
  it('flags soon-expiring documents', () => {
    expect(docUrgency(docs[1], now).color).toBe('var(--warn)')
    expect(docUrgency(docs[0], now).color).toBe('var(--danger)')
  })
  it('schedules 30/7/1-day and same-day reminders', () => {
    const model = DEFAULT_CATALOG.models[0]
    const car: Car = { id: 1, name: 'رانا', modelId: model.id, transmission: 'manual', createdAt: now }
    const r = buildSchedule({ car, model, parts: applicableParts(model, car), readings: [], services: [], checks: [], symptoms: [], documents: [{ id: 9, carId: 1, type: 'insurance', expiresAt: now + 40 * DAY }], settings: DEFAULT_SETTINGS, now, horizonDays: 60 })
    const daysBefore = r.filter((x) => x.kind === 'document').map((x) => Math.round((now + 40 * DAY - x.at) / DAY))
    // 30/7/1/0 days before, then weekly nags once expired
    expect(daysBefore).toEqual([30, 7, 1, 0, -7, -14])
  })
})

describe('per-car overrides', () => {
  it('replaces catalog intervals for that car only', () => {
    const model = DEFAULT_CATALOG.models.find((m) => m.id === 'avante-xd-20')!
    const car: Car = { id: 1, name: 'آوانته', modelId: model.id, transmission: 'auto', createdAt: now, overrides: { 'engine-oil': { intervalKm: 10_000 } } }
    const oil = applicableParts(model, car).find((p) => p.id === 'engine-oil')!
    expect(oil.intervalKm).toBe(10_000)
    expect(oil.intervalMonths).toBe(6)
    expect(model.parts.find((p) => p.id === 'engine-oil')!.intervalKm).toBe(5000)
  })
})

describe('imagesToPdf', () => {
  it('writes a structurally valid PDF with a correct xref table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const bytes = imagesToPdf([{ jpeg, width: 10, height: 14 }, { jpeg, width: 10, height: 14 }])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Count 2')
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    const entries = text.slice(startxref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l))
    expect(entries).toHaveLength(8)
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10))
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })
})
