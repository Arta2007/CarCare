import type { OilTopup, PartSpec, ServiceRecord, Symptom } from './types'
import type { CarContext, PartStatus } from './maintenance'
import { allStatuses, lastServiceFor, latestKm } from './maintenance'
import { addMonths } from './format'
import { CATEGORY_PART_HINTS, SYMPTOM_PART_HINTS } from '../data/extras'

// ── Oil consumption ─────────────────────────────────────────────────────────

export interface OilConsumption {
  /** Litres added per 1000 km since the last oil change */
  perThousand?: number
  liters: number
  km: number
  level: 'normal' | 'watch' | 'high' | 'unknown'
}

/**
 * Oil burnt since the last change. Under ~0.25 L/1000 km is normal; worn
 * engines creep up, and above ~0.5 it is time for a compression test.
 */
export function oilConsumption(ctx: CarContext, topups: OilTopup[]): OilConsumption {
  const change = lastServiceFor('engine-oil', ctx.services)
  const latest = latestKm(ctx.readings, ctx.services)
  const since = topups.filter((t) => !change || t.km >= change.km)
  const liters = since.reduce((a, t) => a + t.liters, 0)
  const km = change && latest ? latest.km - change.km : 0
  // Under 500 km the ratio is mostly noise
  if (!change || km < 500 || !since.length) return { liters, km, level: liters ? 'unknown' : 'normal' }
  const perThousand = (liters / km) * 1000
  return { perThousand, liters, km, level: perThousand > 0.5 ? 'high' : perThousand > 0.25 ? 'watch' : 'normal' }
}

// ── Learning intervals from the car's own history ───────────────────────────

export interface LearnedInterval {
  part: PartSpec
  avgKm: number
  samples: number
  /** Rounded suggestion for a per-car override */
  suggestedKm: number
}

/** Real lifetimes between consecutive replacements (ignoring tiny gaps from typos) */
export function realLifetimes(partId: string, services: ServiceRecord[]): number[] {
  const rec = services.filter((s) => s.partId === partId).sort((a, b) => a.km - b.km)
  return rec.slice(1).map((r, i) => r.km - rec[i].km).filter((d) => d >= 1000)
}

/** Parts whose real life in this car differs from the interval by more than 20% */
export function learnedIntervals(ctx: CarContext): LearnedInterval[] {
  const out: LearnedInterval[] = []
  for (const part of ctx.parts) {
    if (!part.intervalKm) continue
    const lives = realLifetimes(part.id, ctx.services)
    if (!lives.length) continue
    const avgKm = lives.reduce((a, b) => a + b, 0) / lives.length
    if (Math.abs(avgKm - part.intervalKm) / part.intervalKm <= 0.2) continue
    const suggestedKm = Math.max(1000, Math.round(avgKm / 500) * 500)
    if (suggestedKm === part.intervalKm) continue
    out.push({ part, avgKm, samples: lives.length, suggestedKm })
  }
  return out
}

// ── Symptoms ↔ parts ────────────────────────────────────────────────────────

export function relatedPartIds(symptom: Pick<Symptom, 'title' | 'description' | 'category'>): string[] {
  const text = `${symptom.title} ${symptom.description ?? ''}`
  const ids = new Set<string>()
  for (const h of SYMPTOM_PART_HINTS) if (h.match.test(text)) h.parts.forEach((p) => ids.add(p))
  if (!ids.size) (CATEGORY_PART_HINTS[symptom.category] ?? []).forEach((p) => ids.add(p))
  return [...ids]
}

export function relatedStatuses(symptom: Pick<Symptom, 'title' | 'description' | 'category'>, ctx: CarContext): PartStatus[] {
  const ids = new Set(relatedPartIds(symptom))
  return allStatuses(ctx).filter((s) => ids.has(s.part.id))
}

// ── Warranty ────────────────────────────────────────────────────────────────

export interface WarrantyInfo {
  record: ServiceRecord
  part?: PartSpec
  expiresAt: number
}

export function activeWarranties(ctx: CarContext, now = ctx.now): WarrantyInfo[] {
  return ctx.services
    .filter((s) => s.warrantyMonths)
    .map((s) => ({ record: s, part: ctx.model.parts.find((p) => p.id === s.partId), expiresAt: addMonths(s.date, s.warrantyMonths!) }))
    .filter((w) => w.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt)
}
