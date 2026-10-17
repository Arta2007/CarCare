import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { monthSummary, nextMonth, prevMonth, summaryText } from '../lib/summary'
import { fmtKm, fmtNum, fmtToman, jalali, toFa } from '../lib/format'
import { Button, Card, cx, PageHeader, SectionTitle, toast } from '../components/ui'

function Delta({ cur, prev, lowerIsBetter, neutral }: { cur?: number; prev?: number; lowerIsBetter?: boolean; neutral?: boolean }) {
  if (!cur || !prev) return null
  const pct = ((cur - prev) / prev) * 100
  if (Math.abs(pct) < 3) return <span className="text-xs text-muted">مثل ماه قبل</span>
  const good = lowerIsBetter ? pct < 0 : pct > 0
  const Icon = pct > 0 ? ArrowUp : ArrowDown
  return (
    <span className={cx('inline-flex items-center text-xs font-bold', neutral ? 'text-muted' : good ? 'text-ok' : 'text-danger')}>
      <Icon className="size-3.5" />
      {toFa(Math.abs(Math.round(pct)))}٪
    </span>
  )
}

export function SummaryScreen({ data }: { data: ActiveCar }) {
  const now = jalali(data.now)
  // Early in a month the useful summary is the one that just ended
  const [ym, setYm] = useState<[number, number]>(() => (now.jd <= 7 ? prevMonth(now.jy, now.jm) : [now.jy, now.jm]))
  const s = monthSummary(data, ym[0], ym[1])
  const p = monthSummary(data, ...prevMonth(ym[0], ym[1]))
  const isCurrent = ym[0] === now.jy && ym[1] === now.jm
  const total = s.fuelCost + s.serviceCost + s.otherCost
  const prevTotal = p.fuelCost + p.serviceCost + p.otherCost

  async function share() {
    const text = summaryText(data.car.name, s)
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('کپی شد ✓')
      }
    } catch {
      // Cancelled
    }
  }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="خلاصه‌ی ماهانه" subtitle={data.car.name} />
      <div className="px-4">
        <div className="flex items-center justify-between rounded-2xl bg-surface p-2 ring-1 ring-line">
          <button aria-label="ماه قبل" onClick={() => setYm(prevMonth(...ym))} className="grid size-10 place-items-center rounded-xl active:bg-surface-2"><ChevronRight className="size-5" /></button>
          <span className="font-bold">{s.label}{isCurrent ? ' (تا امروز)' : ''}</span>
          <button aria-label="ماه بعد" disabled={isCurrent} onClick={() => setYm(nextMonth(...ym))} className="grid size-10 place-items-center rounded-xl active:bg-surface-2 disabled:opacity-30"><ChevronLeft className="size-5" /></button>
        </div>

        <Card className="mt-3 p-5">
          <p className="text-sm text-muted">کل خرج ماه</p>
          <p className="mt-1 flex items-baseline gap-2 text-3xl font-black">{total ? fmtToman(total) : '—'} <Delta cur={total} prev={prevTotal} lowerIsBetter /></p>
        </Card>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="پیمایش" value={s.km !== undefined ? fmtKm(s.km) : '—'} sub={s.kmPerDay ? `روزانه ~${fmtNum(s.kmPerDay)}` : undefined} delta={<Delta cur={s.km} prev={p.km} neutral />} />
          <Stat label="مصرف سوخت" value={s.consumption ? `${toFa(s.consumption.toFixed(1))} لیتر/۱۰۰` : '—'} delta={<Delta cur={s.consumption} prev={p.consumption} lowerIsBetter />} />
          <Stat label="سوخت" value={s.fuelLiters ? `${toFa(s.fuelLiters.toFixed(0))} لیتر` : '—'} sub={s.fuelCost ? fmtToman(s.fuelCost) : undefined} />
          <Stat label="نگهداری و تعمیر" value={s.serviceCost ? fmtToman(s.serviceCost) : '—'} sub={s.otherCost ? `مدارک: ${fmtToman(s.otherCost)}` : undefined} />
        </div>

        <SectionTitle>انجام‌شده</SectionTitle>
        <Card className="p-4 text-sm leading-7">{s.services.length ? s.services.join('، ') : <span className="text-muted">تعویضی ثبت نشده</span>}</Card>

        {(s.symptomsOpened > 0 || s.symptomsResolved > 0) && (
          <>
            <SectionTitle>مشکلات</SectionTitle>
            <Card className="p-4 text-sm">{toFa(s.symptomsOpened)} مورد جدید • {toFa(s.symptomsResolved)} مورد برطرف شد</Card>
          </>
        )}

        <SectionTitle>ماه بعد</SectionTitle>
        <Card className="p-4 text-sm leading-7">{s.nextMonthDue.length ? s.nextMonthDue.join('، ') : <span className="text-muted">موعدی نیست</span>}</Card>

        <Button className="mt-4 w-full" onClick={share}><Send className="size-5" />ارسال خلاصه</Button>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="flex items-center justify-between text-xs text-muted">{label}{delta}</p>
      <p className="mt-1 font-black">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </Card>
  )
}
