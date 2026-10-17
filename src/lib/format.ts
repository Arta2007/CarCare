import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js'

export const DAY = 86_400_000

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

const faDigits = '۰۱۲۳۴۵۶۷۸۹'

export function toFa(input: string | number): string {
  return String(input).replace(/\d/g, (d) => faDigits[+d])
}

/** Normalises Persian/Arabic digits and separators so the string parses as a number */
export function parseNumber(input: string): number | undefined {
  const s = input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/[,٬،\s]/g, '')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('fa-IR')
}

export function fmtKm(n: number): string {
  return `${fmtNum(n)} کیلومتر`
}

export function fmtToman(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${toFa(m % 1 === 0 ? m.toFixed(0) : m.toFixed(1))} میلیون تومان`
  }
  if (n >= 1000) return `${fmtNum(n / 1000)} هزار تومان`
  return `${fmtNum(n)} تومان`
}

export interface JDate {
  jy: number
  jm: number
  jd: number
}

export function jalali(ts: number): JDate {
  const d = new Date(ts)
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** Local-time timestamp for a Jalali date at the given hour */
export function fromJalali(jy: number, jm: number, jd: number, hour = 0): number {
  const g = toGregorian(jy, jm, jd)
  return new Date(g.gy, g.gm - 1, g.gd, hour).getTime()
}

export function monthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm)
}

export function fmtDate(ts: number, withWeekday = false): string {
  const { jy, jm, jd } = jalali(ts)
  const base = `${toFa(jd)} ${JALALI_MONTHS[jm - 1]} ${toFa(jy)}`
  return withWeekday ? `${WEEKDAYS[new Date(ts).getDay()]}، ${base}` : base
}

export function fmtDateShort(ts: number): string {
  const { jy, jm, jd } = jalali(ts)
  return toFa(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addMonths(ts: number, months: number): number {
  const d = new Date(ts)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return d.getTime()
}

/** Human relative distance in days: "۳ روز دیگر"، "امروز"، "۲ هفته پیش" */
export function fmtRelDays(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
  if (days === 0) return 'امروز'
  if (days === 1) return 'فردا'
  if (days === -1) return 'دیروز'
  const abs = Math.abs(days)
  let s: string
  if (abs < 14) s = `${toFa(abs)} روز`
  else if (abs < 60) s = `${toFa(Math.round(abs / 7))} هفته`
  else if (abs < 365) s = `${toFa(Math.round(abs / 30))} ماه`
  else s = `${toFa((abs / 365).toFixed(1).replace(/\.0$/, ''))} سال`
  return days > 0 ? `${s} دیگر` : `${s} پیش`
}
