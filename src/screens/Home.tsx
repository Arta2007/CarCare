import { useMemo } from 'react'
import { AlertTriangle, BookOpen, CalendarDays, CarFront, Check, ChevronDown, ClipboardList, Droplet, Droplets, FileBadge, FileDown, Fuel, Gauge, Lightbulb, Plane, Share, ShieldCheck, Siren, Sparkles, TrendingUp, Wrench } from 'lucide-react'
import { currentDocuments, docName, docUrgency } from '../lib/documents'
import { fuelStats } from '../lib/fuel'
import { activeWarranties, learnedIntervals, oilConsumption } from '../lib/insights'
import { SEASONAL_TIPS } from '../data/extras'
import { updateSettings } from '../lib/db'
import type { ActiveCar } from '../lib/store'
import { allStatuses, dailyKm, estimateKmNow, healthScore, latestKm, type PartStatus } from '../lib/maintenance'
import { checkDue } from '../lib/schedule'
import { openSheet } from '../lib/sheets'
import { navigate } from '../lib/router'
import { addMonths, fmtDate, fmtKm, fmtNum, fmtRelDays, fromJalali, jalali, toFa } from '../lib/format'
import { isIOS, isStandalone } from '../lib/push'
import { SYMPTOM_CATEGORIES } from '../data/catalog'
import { Card, cx, Progress, Ring, SectionTitle, STATE_META, StateBadge } from '../components/ui'

export function HomeScreen({ data, onSwitchCar }: { data: ActiveCar; onSwitchCar: () => void }) {
  const statuses = useMemo(() => allStatuses(data), [data])
  const latest = latestKm(data.readings, data.services)
  const estimate = estimateKmNow(data)
  const perDay = dailyKm(data.readings, data.services, data.settings, data.now)
  const score = healthScore(statuses)
  const overdue = statuses.filter((s) => s.state === 'overdue')
  const soon = statuses.filter((s) => s.state === 'soon')
  const unknown = statuses.filter((s) => s.state === 'unknown')
  const openSymptoms = data.symptoms.filter((s) => s.status === 'open').sort((a, b) => b.severity - a.severity || b.date - a.date)
  const check = checkDue(data.checks, data.settings, data.now)
  const staleDays = latest ? Math.floor((data.now - latest.date) / 86_400_000) : Infinity
  const scoreColor = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--danger)'
  const showInstall = isIOS() && !isStandalone()
  const expiring = currentDocuments(data.documents).filter((d) => d.expiresAt - data.now < 30 * 86_400_000)
  const fuel = fuelStats(data.fuel, data.now)
  const oil = oilConsumption(data, data.oil)
  const learned = learnedIntervals(data)
  const warranties = activeWarranties(data).filter((w) => w.expiresAt - data.now < 30 * 86_400_000)

  return (
    <div className="pb-tabbar">
      <header className="pt-safe px-4">
        <button onClick={onSwitchCar} className="flex items-center gap-2 py-2 text-start">
          <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
            <CarFront className="size-6" />
          </span>
          <span>
            <span className="flex items-center gap-1 text-xl font-extrabold">
              {data.car.name}
              <ChevronDown className="size-4 text-muted" />
            </span>
            <span className="block text-xs text-muted">{data.model.name}{data.car.year ? ` • ${toFa(data.car.year)}` : ''}</span>
          </span>
        </button>
      </header>

      <div className="px-4">
        {showInstall && (
          <Card className="mt-3 border-0 bg-accent/10 p-4 ring-accent/20">
            <p className="flex items-center gap-2 font-bold text-accent"><Sparkles className="size-5" />برنامه را نصب کن</p>
            <p className="mt-1 text-sm leading-6">
              برای کار آفلاین و دریافت اعلان: در Safari دکمه <Share className="inline size-4" /> را بزن و <b>Add to Home Screen</b> را انتخاب کن.
            </p>
          </Card>
        )}

        {/* Hero: odometer + health */}
        <Card className="mt-3 overflow-hidden p-5">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">کیلومتر فعلی</p>
              <p className="tnum mt-0.5 text-[34px] font-black leading-tight tracking-tight">{latest ? fmtNum(latest.km) : '—'}</p>
              <p className="mt-1 text-xs text-muted">
                {latest ? (
                  <>
                    ثبت {fmtRelDays(latest.date)}
                    {staleDays >= 3 && <> • تخمین امروز ~{fmtNum(estimate)}</>}
                  </>
                ) : (
                  'هنوز ثبت نشده'
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted">میانگین روزانه ~{fmtNum(perDay)} کیلومتر</p>
            </div>
            <Ring value={score / 100} color={scoreColor} size={104} stroke={9}>
              <div>
                <p className="tnum text-2xl font-black" style={{ color: scoreColor }}>{toFa(score)}</p>
                <p className="-mt-1 text-[11px] text-muted">سلامت</p>
              </div>
            </Ring>
          </div>
          <button onClick={() => openSheet({ type: 'odometer' })} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-fg shadow-sm shadow-accent/30 transition active:scale-[0.98]">
            <Gauge className="size-5" /> ثبت کیلومتر جدید
          </button>
          {staleDays >= data.settings.odometerPromptDays && latest && (
            <p className="mt-2 text-center text-xs font-semibold text-warn">{toFa(staleDays)} روز است کیلومتر ثبت نکرده‌ای</p>
          )}
        </Card>

        {/* Summary pills */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Pill count={overdue.length} label="عقب افتاده" color="var(--danger)" onClick={() => navigate('parts/attention')} />
          <Pill count={soon.length} label="نزدیک موعد" color="var(--warn)" onClick={() => navigate('parts/attention')} />
          <Pill count={openSymptoms.length} label="مشکل باز" color="var(--accent)" onClick={() => navigate('symptoms')} />
        </div>

        {/* Quick tools */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Tool icon={<Fuel className="size-5" />} label={fuel.avg ? `${toFa(fuel.avg.toFixed(1))} لیتر` : 'سوخت'} color="#f5a524" onClick={() => navigate('fuel')} />
          <Tool icon={<FileBadge className="size-5" />} label="مدارک" color="#8b5cf6" onClick={() => navigate('documents')} dot={expiring.length > 0} />
          <Tool icon={<ClipboardList className="size-5" />} label="تعمیرگاه" color="#0ea5e9" onClick={() => navigate('visit')} />
          <Tool icon={<TrendingUp className="size-5" />} label="پیش‌بینی" color="#14b8a6" onClick={() => navigate('forecast')} />
          <Tool icon={<CalendarDays className="size-5" />} label="خلاصه ماه" color="#ec4899" onClick={() => navigate('summary')} />
          <Tool icon={<Plane className="size-5" />} label="سفر" color="#6366f1" onClick={() => navigate('trip')} />
          <Tool icon={<BookOpen className="size-5" />} label="راهنما" color="#e5484d" onClick={() => navigate('guide')} />
          <Tool icon={<FileDown className="size-5" />} label="گزارش" color="#64748b" onClick={() => navigate('report')} />
        </div>

        <SeasonalCard data={data} />

        {oil.level === 'high' && (
          <Card onClick={() => navigate('part/engine-oil')} className="mt-3 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger/15 text-danger"><Droplet className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">روغن‌سوزی زیاد</span>
              <span className="block text-sm text-muted">{toFa(oil.perThousand!.toFixed(2))} لیتر در هر ۱۰۰۰ کیلومتر — بررسی موتور پیشنهاد می‌شود</span>
            </span>
          </Card>
        )}

        {warranties.map((w) => (
          <Card key={w.record.id} onClick={() => navigate(`part/${w.record.partId}`)} className="mt-3 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok"><ShieldCheck className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">گارانتی {w.part?.name ?? ''} رو به پایان</span>
              <span className="block text-sm text-muted">تا {fmtDate(w.expiresAt)} — اگر ایرادی دارد الان پیگیری کن</span>
            </span>
          </Card>
        ))}

        {learned.length > 0 && (
          <Card onClick={() => navigate(`part/${learned[0].part.id}`)} className="mt-3 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Lightbulb className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{toFa(learned.length)} پیشنهاد از سابقه‌ی ماشینت</span>
              <span className="block truncate text-sm text-muted">{learned.map((l) => l.part.name).join('، ')} — عمر واقعی با دوره فرق دارد</span>
            </span>
          </Card>
        )}

        {expiring.map((d) => {
          const u = docUrgency(d, data.now)
          return (
            <Card key={d.id} onClick={() => navigate('documents')} className="mt-3 flex items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${u.color} 15%, transparent)`, color: u.color }}><FileBadge className="size-6" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{docName(d)}</span>
                <span className="block text-sm font-semibold" style={{ color: u.color }}>{u.label}</span>
              </span>
            </Card>
          )
        })}

        {check.due && (
          <Card onClick={() => openSheet({ type: 'check' })} className="mt-3 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-500/15 text-cyan-500"><Droplets className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">وقت چک دوره‌ای</span>
              <span className="block text-sm text-muted">آب رادیاتور، روغن، شیشه‌شور، باد لاستیک{check.last ? ` • آخرین: ${fmtRelDays(check.last)}` : ''}</span>
            </span>
            <span className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-bold text-white">چک کن</span>
          </Card>
        )}

        {(overdue.length > 0 || soon.length > 0) && (
          <>
            <SectionTitle action={<button className="text-sm font-semibold text-accent" onClick={() => navigate('parts')}>همه</button>}>نیاز به توجه</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {[...overdue, ...soon].slice(0, 6).map((s) => (
                <DueRow key={s.part.id} s={s} />
              ))}
            </Card>
          </>
        )}

        {openSymptoms.length > 0 && (
          <>
            <SectionTitle action={<button className="text-sm font-semibold text-accent" onClick={() => navigate('symptoms')}>همه</button>}>مشکلات باز</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {openSymptoms.slice(0, 3).map((s) => (
                <button key={s.id} onClick={() => navigate(`symptom/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
                  <Siren className={cx('size-5 shrink-0', s.severity === 3 ? 'text-danger' : s.severity === 2 ? 'text-warn' : 'text-muted')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.title}</span>
                    <span className="block text-xs text-muted">{SYMPTOM_CATEGORIES[s.category]} • {fmtRelDays(s.date)}</span>
                  </span>
                </button>
              ))}
            </Card>
          </>
        )}

        {unknown.length > 0 && (
          <Card onClick={() => navigate('parts/unknown')} className="mt-6 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><AlertTriangle className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{toFa(unknown.length)} قطعه بدون سابقه</span>
              <span className="block text-sm text-muted">آخرین تعویض را ثبت کن تا برنامه بتواند یادآوری کند</span>
            </span>
          </Card>
        )}

        {statuses.length > 0 && overdue.length + soon.length === 0 && unknown.length < statuses.length && (
          <Card className="mt-6 flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok"><Wrench className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">همه چیز مرتب است</span>
              <NextUp statuses={statuses} />
            </span>
          </Card>
        )}
      </div>
    </div>
  )
}

function NextUp({ statuses }: { statuses: PartStatus[] }) {
  const next = statuses.filter((s) => s.dueDate).sort((a, b) => a.dueDate! - b.dueDate!)[0]
  if (!next) return null
  return <span className="block text-sm text-muted">بعدی: {next.part.name} — حدود {fmtDate(next.dueDate!)}</span>
}

/** Shows a seasonal checklist for a month after its date, until ticked off */
function SeasonalCard({ data }: { data: ActiveCar }) {
  const { jy } = jalali(data.now)
  const active = SEASONAL_TIPS.flatMap((t) => [jy, jy - 1].map((y) => ({ t, y, at: fromJalali(y, t.jm, t.jd) })))
    .find(({ t, y, at }) => at <= data.now && data.now < addMonths(at, 1) && !data.settings.seasonalDone.includes(`${y}-${t.id}`))
  if (!active) return null
  const { t, y } = active
  return (
    <Card className="mt-3 p-4">
      <p className="flex items-center gap-2 font-bold"><Sparkles className="size-5 text-amber-500" />{t.title}</p>
      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm leading-6 text-muted">{t.items.map((i) => <li key={i}>{i}</li>)}</ul>
      <div className="mt-3 flex gap-2">
        <button onClick={() => updateSettings({ seasonalDone: [...data.settings.seasonalDone, `${y}-${t.id}`] })} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ok/15 text-sm font-bold text-ok"><Check className="size-4" />انجام دادم</button>
        <button onClick={() => openSheet({ type: 'check' })} className="min-h-10 flex-1 rounded-xl bg-surface-2 text-sm font-semibold">ثبت چک</button>
      </div>
    </Card>
  )
}

function Tool({ icon, label, color, onClick, dot }: { icon: React.ReactNode; label: string; color: string; onClick: () => void; dot?: boolean }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-1 py-3 ring-1 ring-line transition active:scale-[0.97]">
      <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: color }}>{icon}</span>
      <span className="truncate text-[11px] font-semibold">{label}</span>
      {dot && <span className="absolute end-2 top-2 size-2.5 rounded-full bg-danger ring-2 ring-surface" />}
    </button>
  )
}

function Pill({ count, label, color, onClick }: { count: number; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-surface p-3 text-start ring-1 ring-line transition active:scale-[0.98]">
      <p className="tnum text-2xl font-black" style={{ color: count ? color : 'var(--muted)' }}>{toFa(count)}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </button>
  )
}

export function DueRow({ s }: { s: PartStatus }) {
  const meta = STATE_META[s.state]
  let detail = ''
  if (s.kmLeft !== undefined) detail = s.kmLeft <= 0 ? `${fmtKm(-s.kmLeft)} گذشته` : `${fmtKm(s.kmLeft)} مانده`
  if (s.dueDate) detail += `${detail ? ' • ' : ''}${s.dueDateEstimated ? '~' : ''}${fmtRelDays(s.dueDate)}`
  return (
    <button onClick={() => navigate(`part/${s.part.id}`)} className="w-full px-4 py-3 text-start active:bg-surface-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{s.part.name}</span>
        <StateBadge state={s.state} />
      </div>
      <div className="mt-2"><Progress value={s.progress} state={s.state} /></div>
      <p className="mt-1.5 text-xs" style={{ color: s.state === 'ok' ? 'var(--muted)' : meta.color }}>{detail}</p>
    </button>
  )
}
