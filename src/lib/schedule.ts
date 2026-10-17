import type { CarDocument, CheckLog, Symptom } from './types'
import { currentDocuments, docName } from './documents'
import { allStatuses, latestKm, type CarContext } from './maintenance'
import { DAY, fmtKm, fromJalali, jalali, monthLength, startOfDay } from './format'

export type ReminderKind = 'check' | 'odometer' | 'part' | 'symptom' | 'backup' | 'document'

export interface Reminder {
  /** Stable id so re-syncs don't duplicate notifications */
  id: string
  at: number
  kind: ReminderKind
  title: string
  body: string
  /** In-app route opened when the notification is tapped */
  url: string
}

export interface ScheduleInput extends CarContext {
  checks: CheckLog[]
  symptoms: Symptom[]
  documents?: CarDocument[]
  horizonDays: number
}

function atHour(ts: number, hour: number): number {
  const d = new Date(ts)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/** Day-of-month numbers for n evenly spaced checks in a Jalali month */
export function checkDays(n: number, len: number): number[] {
  return Array.from({ length: n }, (_, i) => 1 + Math.floor((i * len) / n))
}

export function fluidCheckDates(from: number, to: number, ctx: Pick<ScheduleInput, 'settings'>): number[] {
  const { settings } = ctx
  const out: number[] = []
  let { jy, jm } = jalali(from)
  for (let guard = 0; guard < 36; guard++) {
    const summer = settings.summerMonths.includes(jm)
    const n = summer ? settings.checksPerMonthSummer : settings.checksPerMonthNormal
    for (const d of checkDays(n, monthLength(jy, jm))) {
      const ts = fromJalali(jy, jm, d, settings.notifyHour)
      if (ts > to) return out
      if (ts > from) out.push(ts)
    }
    jm++
    if (jm > 12) {
      jm = 1
      jy++
    }
  }
  return out
}

export function buildSchedule(input: ScheduleInput): Reminder[] {
  const { car, settings, now } = input
  const to = now + input.horizonDays * DAY
  const hour = settings.notifyHour
  const carTag = `c${car.id}`
  const out: Reminder[] = []
  const push = (r: Reminder) => {
    if (r.at > now && r.at <= to) out.push(r)
  }

  // Under-the-hood checks: 2×/month normally, 4×/month in summer.
  const lastCheck = Math.max(0, ...input.checks.map((c) => c.date))
  for (const at of fluidCheckDates(now, to, input)) {
    // A check logged in the last 3 days makes the next prompt redundant
    if (at - lastCheck < 3 * DAY) continue
    push({
      id: `${carTag}-check-${startOfDay(at)}`,
      at,
      kind: 'check',
      title: `چک دوره‌ای ${car.name}`,
      body: 'آب رادیاتور، روغن موتور، آب شیشه‌شور و باد لاستیک‌ها را چک کن.',
      url: '#/checks',
    })
  }

  const statuses = allStatuses(input)

  // Parts: a heads-up a week before, on the predicted day, then weekly while overdue.
  for (const s of statuses) {
    if (!s.dueDate || (s.state !== 'ok' && s.state !== 'soon' && s.state !== 'overdue')) continue
    const name = s.part.name
    const kmHint = s.dueKm ? ` (حدود ${fmtKm(s.dueKm)})` : ''
    const due = atHour(s.dueDate, hour)
    const pid = `${carTag}-part-${s.part.id}-${s.last?.id ?? 0}`
    push({ id: `${pid}-pre`, at: due - 7 * DAY, kind: 'part', title: `${name} به‌زودی`, body: `حدود یک هفته تا موعد تعویض ${name}${kmHint} مانده. کیلومتر را ثبت کن تا دقیق‌تر شود.`, url: `#/part/${s.part.id}` })
    push({ id: `${pid}-due`, at: due, kind: 'part', title: `موعد تعویض ${name}`, body: `طبق برآورد، ${name} الان باید تعویض شود${kmHint}.`, url: `#/part/${s.part.id}` })
    const firstNag = Math.max(due + 7 * DAY, atHour(now + DAY, hour))
    for (let i = 0; i < 4; i++) {
      push({ id: `${pid}-nag-${i}`, at: firstNag + i * 7 * DAY, kind: 'part', title: `${name} عقب افتاده`, body: `تعویض ${name} گذشته است. اگر عوضش کرده‌ای ثبتش کن.`, url: `#/part/${s.part.id}` })
    }
  }

  // Odometer prompts: more often when something is coming due.
  const urgent = statuses.some((s) => s.state === 'overdue' || (s.dueDate !== undefined && s.dueDate - now < 30 * DAY))
  const every = (urgent ? settings.odometerPromptDaysUrgent : settings.odometerPromptDays) * DAY
  const lastKm = latestKm(input.readings, input.services)
  let next = atHour((lastKm?.date ?? now) + every, hour)
  if (next <= now) next = atHour(now + DAY, hour)
  for (; next <= to; next += every) {
    push({ id: `${carTag}-odo-${startOfDay(next)}`, at: next, kind: 'odometer', title: 'کیلومتر ماشین را ثبت کن', body: `عدد کیلومترشمار ${car.name} را وارد کن تا یادآورها دقیق بمانند.`, url: '#/odometer' })
  }

  // Open symptoms: on the chosen follow-up date, then weekly.
  for (const sym of input.symptoms) {
    if (sym.status !== 'open') continue
    let at = atHour(sym.remindAt ?? sym.date + settings.symptomFollowupDays * DAY, hour)
    if (at <= now) at = atHour(now + DAY, hour)
    for (let i = 0; i < 4; i++, at += 7 * DAY) {
      push({ id: `${carTag}-sym-${sym.id}-${i}`, at, kind: 'symptom', title: `پیگیری: ${sym.title}`, body: 'این مشکل هنوز هست؟ اگر برطرف شده در برنامه ببندش، وگرنه به تعمیرکار نشان بده.', url: `#/symptom/${sym.id}` })
    }
  }

  // Insurance, inspection etc.: 30, 7 and 1 day(s) before, on the day, then weekly once expired.
  for (const d of currentDocuments(input.documents ?? [])) {
    const name = docName(d)
    const exp = atHour(d.expiresAt, hour)
    const did = `${carTag}-doc-${d.id}-${startOfDay(d.expiresAt)}`
    for (const days of [30, 7, 1]) {
      push({ id: `${did}-${days}`, at: exp - days * DAY, kind: 'document', title: `${name} رو به اتمام است`, body: `${name} ${car.name} ${days === 1 ? 'فردا' : `${days} روز دیگر`} منقضی می‌شود. برای تمدید اقدام کن.`, url: '#/documents' })
    }
    push({ id: `${did}-0`, at: exp, kind: 'document', title: `${name} امروز منقضی می‌شود`, body: 'اگر تمدید کرده‌ای، تاریخ جدید را در برنامه ثبت کن.', url: '#/documents' })
    const firstNag = Math.max(exp + 7 * DAY, atHour(now + DAY, hour))
    for (let i = 0; i < 4; i++) {
      push({ id: `${did}-nag-${i}`, at: firstNag + i * 7 * DAY, kind: 'document', title: `${name} منقضی شده`, body: `${name} تمدید نشده است. رانندگی بدون آن جریمه دارد.`, url: '#/documents' })
    }
  }

  return out.sort((a, b) => a.at - b.at)
}

/** Backup reminders are app-wide, not per car */
export function backupReminders(lastBackupAt: number | undefined, everyDays: number, hour: number, now: number, horizonDays: number): Reminder[] {
  const out: Reminder[] = []
  let at = atHour((lastBackupAt ?? now) + everyDays * DAY, hour)
  if (at <= now) at = atHour(now + DAY, hour)
  for (; at <= now + horizonDays * DAY; at += everyDays * DAY) {
    out.push({ id: `backup-${startOfDay(at)}`, at, kind: 'backup', title: 'وقت پشتیبان‌گیری', body: 'از اطلاعات ماشین‌ها یک فایل پشتیبان در Files آیفون ذخیره کن.', url: '#/backup' })
  }
  return out
}

/** Whether an under-the-hood check is due now, given this month's cadence */
export function checkDue(checks: CheckLog[], settings: ScheduleInput['settings'], now: number): { due: boolean; last?: number; everyDays: number } {
  const { jm } = jalali(now)
  const perMonth = settings.summerMonths.includes(jm) ? settings.checksPerMonthSummer : settings.checksPerMonthNormal
  const everyDays = Math.max(1, Math.round(30 / Math.max(1, perMonth)))
  const last = checks.length ? Math.max(...checks.map((c) => c.date)) : undefined
  return { due: !last || now - last >= everyDays * DAY, last, everyDays }
}
