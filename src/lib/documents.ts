import { DAY, fmtDate, fmtRelDays, toFa } from './format'
import type { CarDocument, DocType } from './types'

export const DOC_TYPES: Record<DocType, { name: string; months: number; color: string }> = {
  insurance: { name: 'بیمه شخص ثالث', months: 12, color: '#2f6bff' },
  'body-insurance': { name: 'بیمه بدنه', months: 12, color: '#8b5cf6' },
  inspection: { name: 'معاینه فنی', months: 12, color: '#17b26a' },
  tolls: { name: 'عوارض سالانه', months: 12, color: '#f5a524' },
  license: { name: 'گواهینامه', months: 120, color: '#64748b' },
  other: { name: 'سایر', months: 12, color: '#14b8a6' },
}

export function docName(d: CarDocument): string {
  return d.type === 'other' && d.title ? d.title : DOC_TYPES[d.type].name
}

/** The newest document of each type — older ones are history after a renewal */
export function currentDocuments(docs: CarDocument[]): CarDocument[] {
  const latest = new Map<string, CarDocument>()
  for (const d of docs) {
    const key = d.type === 'other' ? `other:${d.title ?? ''}` : d.type
    const cur = latest.get(key)
    if (!cur || d.expiresAt > cur.expiresAt) latest.set(key, d)
  }
  return [...latest.values()].sort((a, b) => a.expiresAt - b.expiresAt)
}

export function docUrgency(d: CarDocument, now = Date.now()): { color: string; label: string } {
  const days = Math.ceil((d.expiresAt - now) / DAY)
  if (days < 0) return { color: 'var(--danger)', label: `منقضی شده — ${fmtRelDays(d.expiresAt, now)}` }
  if (days <= 30) return { color: 'var(--warn)', label: days === 0 ? 'امروز منقضی می‌شود' : `${toFa(days)} روز مانده` }
  return { color: 'var(--ok)', label: `تا ${fmtDate(d.expiresAt)}` }
}
