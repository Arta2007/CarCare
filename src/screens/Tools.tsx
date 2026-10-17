import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Plane, RotateCcw, Send, TrendingUp, Wrench } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { buildForecast } from '../lib/forecast'
import { allStatuses, latestKm, type PartStatus } from '../lib/maintenance'
import { currentDocuments, docName } from '../lib/documents'
import { checkDue } from '../lib/schedule'
import { updateSettings } from '../lib/db'
import { navigate } from '../lib/router'
import { openSheet } from '../lib/sheets'
import { addMonths, fmtDate, fmtKm, fmtToman, jalali, JALALI_MONTHS, toFa } from '../lib/format'
import { TRIP_ITEMS } from '../data/extras'
import { Button, Card, cx, Empty, NumberInput, PageHeader, SectionTitle, Segmented, TextArea, toast } from '../components/ui'

// ── Cost forecast ───────────────────────────────────────────────────────────

export function ForecastScreen({ data }: { data: ActiveCar }) {
  const [months, setMonths] = useState(6)
  const [useInflation, setUseInflation] = useState(true)
  const inflation = useInflation ? data.settings.inflationMonthly : 0
  const f = useMemo(() => buildForecast(data, months, inflation), [data, months, inflation])

  // Totals per Jalali month for the bar chart
  const buckets: { label: string; parts: number; other: number }[] = []
  for (let i = 0; i < months; i++) {
    const { jm } = jalali(addMonths(data.now, i))
    buckets.push({ label: JALALI_MONTHS[jm - 1].slice(0, 3), parts: 0, other: 0 })
  }
  for (const it of f.items) {
    const idx = Math.min(months - 1, Math.max(0, (jalali(it.date).jy - jalali(data.now).jy) * 12 + jalali(it.date).jm - jalali(data.now).jm))
    if (it.kind === 'part') buckets[idx].parts += it.cost
    else buckets[idx].other += it.cost
  }
  const max = Math.max(1, ...buckets.map((b) => b.parts + b.other))
  const partsTotal = f.items.filter((i) => i.kind === 'part').reduce((a, i) => a + i.cost, 0)
  const biggest = f.items.filter((i) => i.kind !== 'fuel').sort((a, b) => b.cost - a.cost)[0]

  return (
    <div className="pb-tabbar">
      <PageHeader back title="پیش‌بینی هزینه" subtitle={data.car.name} />
      <div className="px-4">
        <Segmented value={months} onChange={setMonths} options={[{ value: 3, label: '۳ ماه' }, { value: 6, label: '۶ ماه' }, { value: 12, label: '۱۲ ماه' }]} />
        <Card className="mt-3 p-5">
          <p className="text-sm text-muted">خرج تقریبی {toFa(months)} ماه آینده</p>
          <p className="mt-1 text-3xl font-black">{fmtToman(f.total)}</p>
          <p className="mt-1 text-sm text-muted">قطعات و سرویس: {fmtToman(partsTotal)}{f.total > partsTotal ? ` • سوخت و مدارک: ${fmtToman(f.total - partsTotal)}` : ''}</p>
          {biggest && <p className="mt-2 text-sm">بزرگ‌ترین خرج: <b>{biggest.name}</b> حدود {fmtDate(biggest.date)}</p>}
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useInflation} onChange={(e) => setUseInflation(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            با احتساب تورم ماهانه
            <span className="w-16"><NumberInput value={data.settings.inflationMonthly} onChange={(v) => v !== undefined && v < 30 && updateSettings({ inflationMonthly: v })} /></span>
            ٪
          </label>
        </Card>

        <SectionTitle>ماه به ماه</SectionTitle>
        <Card className="p-4">
          <div className="flex h-36 items-end gap-1.5">
            {buckets.map((b, i) => (
              <div key={i} className="flex h-full flex-1 flex-col justify-end" title={fmtToman(b.parts + b.other)}>
                <div className="w-full rounded-t-md bg-amber-400" style={{ height: `${(b.other / max) * 100}%` }} />
                <div className={cx('w-full bg-accent', !b.other && 'rounded-t-md')} style={{ height: `${Math.max(2, (b.parts / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 text-center text-[9px] text-muted">{buckets.map((b, i) => <span key={i} className="flex-1 truncate">{b.label}</span>)}</div>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-accent" />قطعات</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-400" />سوخت و مدارک</span>
          </div>
        </Card>

        {f.unknownParts > 0 && (
          <Card onClick={() => navigate('parts/unknown')} className="mt-3 flex items-center gap-3 p-4">
            <AlertTriangle className="size-5 shrink-0 text-warn" />
            <span className="text-sm leading-6">{toFa(f.unknownParts)} قطعه سابقه ندارد و در این حساب نیامده. آخرین تعویضشان را ثبت کن تا پیش‌بینی کامل شود.</span>
          </Card>
        )}

        <SectionTitle>جزئیات</SectionTitle>
        {!f.items.length ? (
          <Empty icon={<TrendingUp className="size-8" />} title="خرجی پیش‌بینی نشده" text="برای پیش‌بینی، سابقه‌ی تعویض قطعات و قیمتشان لازم است." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {f.items.filter((i) => i.kind !== 'fuel').map((i) => (
              <button key={i.key} disabled={!i.partId} onClick={() => i.partId && navigate(`part/${i.partId}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start active:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{i.name}</span>
                  <span className="block text-xs text-muted">حدود {fmtDate(i.date)}</span>
                </span>
                <span className="shrink-0 text-sm font-bold">{fmtToman(i.cost)}</span>
              </button>
            ))}
          </Card>
        )}
        <p className="mt-3 px-1 text-xs leading-5 text-muted">بر اساس قیمت‌های کاتالوگ (قابل ویرایش در بخش توسعه‌دهنده)، کیلومتر روزانه‌ی تو و تورم انتخابی. تخمینی است.</p>
      </div>
    </div>
  )
}

// ── Mechanic visit list ─────────────────────────────────────────────────────

const SPEC_FOR_PART: Record<string, string[]> = {
  'engine-oil': ['روغن موتور'],
  atf: ['روغن گیربکس اتوماتیک'],
  'gearbox-oil': ['روغن گیربکس دستی', 'روغن گیربکس'],
  coolant: ['مایع خنک‌کننده'],
  'brake-fluid': ['روغن ترمز'],
  tires: ['سایز لاستیک'],
  'ps-fluid': ['روغن هیدرولیک'],
  'spark-plugs': ['شمع'],
}

function specFor(data: ActiveCar, partId: string): string | undefined {
  for (const label of SPEC_FOR_PART[partId] ?? []) {
    const s = data.model.specs.find((x) => x.label.startsWith(label))
    if (s) return s.value
  }
  return undefined
}

export function VisitScreen({ data }: { data: ActiveCar }) {
  const statuses = useMemo(() => allStatuses(data), [data])
  const due = statuses.filter((s) => s.state === 'overdue' || s.state === 'soon')
  const others = statuses.filter((s) => s.state !== 'overdue' && s.state !== 'soon' && s.state !== 'untracked')
  const open = data.symptoms.filter((s) => s.status === 'open')
  const [parts, setParts] = useState<string[]>(due.map((s) => s.part.id))
  const [symptoms, setSymptoms] = useState<number[]>(open.map((s) => s.id!))
  const [notes, setNotes] = useState('')
  const [showAll, setShowAll] = useState(false)
  const latest = latestKm(data.readings, data.services)
  const partName = (id: string) => data.parts.find((p) => p.id === id)?.name ?? id

  const text = [
    `🔧 کارهای تعمیرگاه — ${data.car.name}`,
    `${data.model.name} • ${data.model.engine} • ${data.car.transmission === 'auto' ? 'اتوماتیک' : 'دنده‌ای'}${latest ? ` • ${fmtKm(latest.km)}` : ''}`,
    '',
    ...(parts.length ? ['تعویض / سرویس:', ...parts.map((id) => `☐ ${partName(id)}${specFor(data, id) ? ` — ${specFor(data, id)}` : ''}`), ''] : []),
    ...(symptoms.length
      ? ['ایرادها برای بررسی:', ...open.filter((s) => symptoms.includes(s.id!)).map((s) => `☐ ${s.title}${s.description ? ` (${s.description})` : ''}`), '']
      : []),
    ...(notes.trim() ? ['یادداشت:', notes.trim(), ''] : []),
  ].join('\n')

  async function share() {
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('کپی شد ✓')
      }
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') {
        await navigator.clipboard?.writeText(text).catch(() => {})
        toast('کپی شد ✓')
      }
    }
  }

  const PartRow = ({ s }: { s: PartStatus }) => {
    const on = parts.includes(s.part.id)
    return (
      <button onClick={() => setParts((p) => (on ? p.filter((x) => x !== s.part.id) : [...p, s.part.id]))} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
        <span className={cx('grid size-6 shrink-0 place-items-center rounded-md ring-2', on ? 'bg-accent text-white ring-accent' : 'ring-line')}>{on && <Check className="size-4" strokeWidth={3} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{s.part.name}</span>
          <span className="block truncate text-xs text-muted">{specFor(data, s.part.id) ?? (s.state === 'overdue' ? 'موعدش گذشته' : s.state === 'soon' ? 'نزدیک موعد' : '')}</span>
        </span>
      </button>
    )
  }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="لیست تعمیرگاه" subtitle="برای ارسال به تعمیرکار در تلگرام یا واتساپ" />
      <div className="px-4">
        <SectionTitle>تعویض و سرویس ({toFa(parts.length)})</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          {due.map((s) => <PartRow key={s.part.id} s={s} />)}
          {!due.length && <p className="p-4 text-sm text-muted">چیزی نزدیک موعد نیست.</p>}
          <button onClick={() => setShowAll((v) => !v)} className="w-full px-4 py-3 text-sm font-semibold text-accent">{showAll ? 'بستن' : 'افزودن قطعات دیگر'}</button>
          {showAll && others.map((s) => <PartRow key={s.part.id} s={s} />)}
        </Card>

        {open.length > 0 && (
          <>
            <SectionTitle>ایرادها ({toFa(symptoms.length)})</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {open.map((s) => {
                const on = symptoms.includes(s.id!)
                return (
                  <button key={s.id} onClick={() => setSymptoms((x) => (on ? x.filter((i) => i !== s.id) : [...x, s.id!]))} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
                    <span className={cx('grid size-6 shrink-0 place-items-center rounded-md ring-2', on ? 'bg-danger text-white ring-danger' : 'ring-line')}>{on && <Check className="size-4" strokeWidth={3} />}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>
                  </button>
                )
              })}
            </Card>
          </>
        )}

        <SectionTitle>یادداشت برای تعمیرکار</SectionTitle>
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً روغن بهران رانا خودم می‌آورم" />

        <SectionTitle>پیش‌نمایش</SectionTitle>
        <Card className="whitespace-pre-wrap p-4 text-sm leading-7">{text}</Card>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={share}><Send className="size-5" />ارسال</Button>
          <Button variant="secondary" onClick={async () => { await navigator.clipboard?.writeText(text); toast('کپی شد ✓') }}><Copy className="size-5" />کپی</Button>
        </div>
        <Button variant="secondary" className="mt-2 w-full" disabled={!parts.length} onClick={() => openSheet({ type: 'service', partIds: parts })}>
          <Wrench className="size-5" />از تعمیرگاه برگشتم — ثبت همین موارد
        </Button>
      </div>
    </div>
  )
}

// ── Pre-trip checklist ──────────────────────────────────────────────────────

const TRIP_KEY = 'carcare-trip'

function loadTrip(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRIP_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function TripScreen({ data }: { data: ActiveCar }) {
  const [distance, setDistance] = useState<number | undefined>(800)
  const [done, setDone] = useState<string[]>(loadTrip)
  const save = (next: string[]) => {
    setDone(next)
    try {
      localStorage.setItem(TRIP_KEY, JSON.stringify(next))
    } catch {
      // Ticks just won't survive closing the app
    }
  }
  const toggle = (id: string) => save(done.includes(id) ? done.filter((x) => x !== id) : [...done, id])

  // Problems the app already knows about for a trip of this length
  const warnings: string[] = []
  const tripDays = Math.max(3, Math.ceil((distance ?? 0) / 400))
  for (const s of allStatuses(data)) {
    if (s.state === 'overdue') warnings.push(`${s.part.name}: موعد تعویض گذشته`)
    else if (s.kmLeft !== undefined && distance && s.kmLeft < distance) warnings.push(`${s.part.name}: فقط ${fmtKm(s.kmLeft)} تا موعد مانده`)
  }
  for (const d of currentDocuments(data.documents)) {
    if (d.expiresAt < data.now + (tripDays + 7) * 86_400_000) warnings.push(`${docName(d)}: ${d.expiresAt < data.now ? 'منقضی شده' : `تا ${fmtDate(d.expiresAt)} اعتبار دارد`}`)
  }
  for (const s of data.symptoms) if (s.status === 'open' && s.severity >= 2) warnings.push(`ایراد باز: ${s.title}`)
  if (checkDue(data.checks, data.settings, data.now).due) warnings.push('چک دوره‌ای مایعات انجام نشده')
  const winter = [9, 10, 11].includes(jalali(data.now).jm)

  const total = TRIP_ITEMS.reduce((a, g) => a + g.items.length, 0) + (winter ? 1 : 0)

  return (
    <div className="pb-tabbar">
      <PageHeader back title="چک‌لیست سفر" subtitle={data.car.name} action={<button aria-label="از نو" onClick={() => save([])} className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted"><RotateCcw className="size-5" /></button>} />
      <div className="px-4">
        <Card className="flex items-center gap-3 p-4">
          <Plane className="size-6 shrink-0 text-accent" />
          <span className="flex-1 text-sm font-semibold">مسافت تقریبی رفت و برگشت</span>
          <span className="w-32"><NumberInput value={distance} onChange={setDistance} suffix="km" /></span>
        </Card>

        {warnings.length > 0 ? (
          <Card className="mt-3 border-0 bg-danger/10 p-4 ring-danger/20">
            <p className="mb-2 flex items-center gap-2 font-bold text-danger"><AlertTriangle className="size-5" />قبل از سفر رسیدگی کن</p>
            <ul className="list-disc space-y-1 ps-5 text-sm leading-6">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Card>
        ) : (
          <Card className="mt-3 border-0 bg-ok/10 p-4 text-sm font-semibold text-ok ring-ok/20">طبق سوابق، ماشین برای این سفر مشکلی ندارد ✓</Card>
        )}

        <p className="mt-4 px-1 text-sm font-bold text-muted">{toFa(done.length)} از {toFa(total)} مورد</p>
        {TRIP_ITEMS.map((g) => (
          <div key={g.group}>
            <SectionTitle>{g.group}</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {[...g.items, ...(winter && g.group === 'تجهیزات' ? ['زنجیر چرخ (مسیر کوهستانی)'] : [])].map((it) => {
                const id = `${g.group}:${it}`
                const on = done.includes(id)
                return (
                  <button key={id} onClick={() => toggle(id)} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
                    <span className={cx('grid size-7 shrink-0 place-items-center rounded-full ring-2 transition', on ? 'bg-ok text-white ring-ok' : 'ring-line')}>{on && <Check className="size-4" strokeWidth={3} />}</span>
                    <span className={cx('font-semibold', on && 'text-muted line-through')}>{it}</span>
                  </button>
                )
              })}
            </Card>
          </div>
        ))}
        <p className="mt-4 text-center text-xs text-muted">سفر بی‌خطر! تیک‌ها تا وقتی «از نو» را بزنی می‌مانند.</p>
      </div>
    </div>
  )
}
