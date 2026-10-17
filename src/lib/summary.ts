import type { ActiveCar } from './store'
import { allStatuses } from './maintenance'
import { fuelSegments } from './fuel'
import { fmtKm, fmtNum, fmtToman, fromJalali, JALALI_MONTHS, monthLength, toFa } from './format'

export interface MonthSummary {
  jy: number
  jm: number
  label: string
  km?: number
  kmPerDay?: number
  fuelLiters: number
  fuelCost: number
  consumption?: number
  serviceCost: number
  otherCost: number
  services: string[]
  symptomsOpened: number
  symptomsResolved: number
  nextMonthDue: string[]
}

export function monthRange(jy: number, jm: number): [number, number] {
  return [fromJalali(jy, jm, 1), fromJalali(jy, jm, monthLength(jy, jm)) + 86_400_000 - 1]
}

export function prevMonth(jy: number, jm: number): [number, number] {
  return jm === 1 ? [jy - 1, 12] : [jy, jm - 1]
}

export function nextMonth(jy: number, jm: number): [number, number] {
  return jm === 12 ? [jy + 1, 1] : [jy, jm + 1]
}

/** Odometer at a moment, interpolated between the readings around it */
function kmAt(points: { km: number; date: number }[], at: number): number | undefined {
  const before = points.filter((p) => p.date <= at).sort((a, b) => b.date - a.date)[0]
  const after = points.filter((p) => p.date > at).sort((a, b) => a.date - b.date)[0]
  if (before && after) return before.km + ((after.km - before.km) * (at - before.date)) / (after.date - before.date)
  return undefined
}

export function monthSummary(data: ActiveCar, jy: number, jm: number): MonthSummary {
  const [from, to] = monthRange(jy, jm)
  const inMonth = <T extends { date: number }>(xs: T[]) => xs.filter((x) => x.date >= from && x.date <= to)
  const points = [...data.readings, ...data.services].map((p) => ({ km: p.km, date: p.date }))

  // Distance needs readings on both sides of each month boundary; fall back to within-month span
  const startKm = kmAt(points, from)
  const endKm = kmAt(points, Math.min(to, data.now))
  const monthPts = inMonth(points)
  let km: number | undefined
  if (startKm !== undefined && endKm !== undefined) km = endKm - startKm
  else if (monthPts.length >= 2) km = Math.max(...monthPts.map((p) => p.km)) - Math.min(...monthPts.map((p) => p.km))
  const days = (Math.min(to, data.now) - from) / 86_400_000
  const fuel = inMonth(data.fuel)
  const segs = fuelSegments(data.fuel).filter((s) => s.end.date >= from && s.end.date <= to)
  const segKm = segs.reduce((a, s) => a + s.km, 0)
  const partName = (id: string) => data.model.parts.find((p) => p.id === id)?.name ?? id
  const services = inMonth(data.services)

  const [ny, nm] = nextMonth(jy, jm)
  const [nFrom, nTo] = monthRange(ny, nm)
  const nextMonthDue = allStatuses(data)
    .filter((s) => s.dueDate && s.dueDate <= nTo && (s.dueDate >= nFrom || s.state === 'overdue'))
    .map((s) => s.part.name)

  return {
    jy,
    jm,
    label: `${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`,
    km: km !== undefined && km >= 0 ? Math.round(km) : undefined,
    kmPerDay: km !== undefined && km >= 0 && days > 0 ? km / days : undefined,
    fuelLiters: fuel.reduce((a, f) => a + f.liters, 0),
    fuelCost: fuel.reduce((a, f) => a + (f.cost ?? 0), 0),
    consumption: segKm ? (segs.reduce((a, s) => a + s.liters, 0) / segKm) * 100 : undefined,
    serviceCost: services.reduce((a, s) => a + (s.cost ?? 0), 0),
    otherCost: inMonth(data.documents.map((d) => ({ ...d, date: d.issuedAt ?? 0 }))).reduce((a, d) => a + (d.cost ?? 0), 0),
    services: [...new Set(services.map((s) => partName(s.partId)))],
    symptomsOpened: inMonth(data.symptoms).length,
    symptomsResolved: data.symptoms.filter((s) => s.resolvedAt && s.resolvedAt >= from && s.resolvedAt <= to).length,
    nextMonthDue,
  }
}

/** Plain-text version for sharing to Telegram / WhatsApp */
export function summaryText(carName: string, s: MonthSummary): string {
  const lines = [`🚗 خلاصه‌ی ${s.label} — ${carName}`, '']
  if (s.km !== undefined) lines.push(`📍 پیمایش: ${fmtKm(s.km)}${s.kmPerDay ? ` (روزانه ~${fmtNum(s.kmPerDay)})` : ''}`)
  if (s.fuelLiters) lines.push(`⛽ سوخت: ${toFa(s.fuelLiters.toFixed(0))} لیتر${s.fuelCost ? ` — ${fmtToman(s.fuelCost)}` : ''}${s.consumption ? ` — مصرف ${toFa(s.consumption.toFixed(1))} لیتر/۱۰۰` : ''}`)
  if (s.serviceCost) lines.push(`🔧 نگهداری: ${fmtToman(s.serviceCost)}`)
  if (s.otherCost) lines.push(`📄 بیمه و مدارک: ${fmtToman(s.otherCost)}`)
  if (s.services.length) lines.push(`✅ انجام شد: ${s.services.join('، ')}`)
  if (s.symptomsOpened || s.symptomsResolved) lines.push(`⚠️ مشکلات: ${toFa(s.symptomsOpened)} جدید، ${toFa(s.symptomsResolved)} برطرف‌شده`)
  if (s.nextMonthDue.length) lines.push(`⏭ ماه بعد: ${s.nextMonthDue.join('، ')}`)
  lines.push('', 'ساخته‌شده با کارکر')
  return lines.join('\n')
}
