import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarPlus, CarFront, ChartColumn, Code2, DatabaseBackup, Download, FileText, History, Moon, Upload, Wrench } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { allReminders, useSettings } from '../lib/store'
import { exportAll, importAll, updateSettings } from '../lib/db'
import { navigate } from '../lib/router'
import { pickFile, saveFile } from '../lib/files'
import { toICS } from '../lib/ics'
import { disablePush, enablePush, isIOS, isStandalone, pushSupported, syncPush, testPush } from '../lib/push'
import type { Reminder } from '../lib/schedule'
import { CATEGORIES, CHECK_ITEMS, SYMPTOM_CATEGORIES } from '../data/catalog'
import { DAY, fmtDate, fmtDateShort, fmtKm, fmtNum, fmtRelDays, fmtToman, jalali, JALALI_MONTHS, toFa } from '../lib/format'
import type { CategoryId } from '../lib/types'
import { Button, Card, Chip, cx, Empty, Field, IconBox, ListRow, NumberInput, PageHeader, SectionTitle, Segmented, TextInput, toast } from '../components/ui'

const APP_VERSION = '1.0.0'

export function MoreScreen({ data }: { data: ActiveCar }) {
  const settings = useSettings()
  const taps = useRef(0)
  const backupAge = settings.lastBackupAt ? Math.floor((Date.now() - settings.lastBackupAt) / DAY) : undefined

  async function versionTap() {
    taps.current++
    if (taps.current >= 7) {
      taps.current = 0
      await updateSettings({ developer: !settings.developer })
      toast(settings.developer ? 'حالت توسعه‌دهنده خاموش شد' : 'حالت توسعه‌دهنده فعال شد 🛠')
    }
  }

  return (
    <div className="pb-tabbar">
      <PageHeader title="بیشتر" />
      <div className="px-4">
        <Card className="divide-y divide-line overflow-hidden">
          <ListRow icon={<IconBox color="#2f6bff"><CarFront className="size-5" /></IconBox>} title="ماشین‌های من" onClick={() => navigate('cars')} />
          <ListRow icon={<IconBox color="#64748b"><FileText className="size-5" /></IconBox>} title="مشخصات فنی" subtitle={data.model.name} onClick={() => navigate('specs')} />
        </Card>

        <SectionTitle>یادآوری</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <ListRow icon={<IconBox color="#e5484d"><Bell className="size-5" /></IconBox>} title="اعلان‌ها و یادآورها" subtitle={settings.pushServer ? 'اعلان فعال' : 'تقویم آیفون / اعلان'} onClick={() => navigate('notifications')} />
        </Card>

        <SectionTitle>گزارش</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <ListRow icon={<IconBox color="#8b5cf6"><History className="size-5" /></IconBox>} title="تاریخچه‌ی کامل" onClick={() => navigate('history')} />
          <ListRow icon={<IconBox color="#17b26a"><ChartColumn className="size-5" /></IconBox>} title="هزینه‌ها" onClick={() => navigate('costs')} />
        </Card>

        <SectionTitle>داده‌ها</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          <ListRow
            icon={<IconBox color="#f5a524"><DatabaseBackup className="size-5" /></IconBox>}
            title="پشتیبان‌گیری و بازیابی"
            subtitle={backupAge === undefined ? 'هنوز پشتیبانی گرفته نشده' : `آخرین پشتیبان: ${fmtRelDays(settings.lastBackupAt!)}`}
            trailing={backupAge === undefined || backupAge > settings.backupReminderDays ? <span className="size-2.5 rounded-full bg-danger" /> : undefined}
            onClick={() => navigate('backup')}
          />
          {settings.developer && <ListRow icon={<IconBox color="#0f172a"><Code2 className="size-5" /></IconBox>} title="بخش توسعه‌دهنده" subtitle="ویرایش دوره‌ها، قیمت‌ها و مدل‌ها" onClick={() => navigate('dev')} />}
        </Card>

        <ThemeCard />

        <button onClick={versionTap} className="mx-auto mt-8 block select-none text-center text-xs text-muted">
          کارکر — نسخه {toFa(APP_VERSION)}
          <br />
          همه‌ی اطلاعات فقط روی همین گوشی ذخیره می‌شود
        </button>
      </div>
    </div>
  )
}

function ThemeCard() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('theme') ?? 'auto'
    } catch {
      return 'auto'
    }
  })
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // Storage may be unavailable; the choice just won't persist
    }
  }, [theme])
  return (
    <>
      <SectionTitle><span className="flex items-center gap-2"><Moon className="size-4" />ظاهر</span></SectionTitle>
      <Segmented value={theme} onChange={setTheme} options={[{ value: 'auto', label: 'خودکار' }, { value: 'light', label: 'روشن' }, { value: 'dark', label: 'تیره' }]} />
    </>
  )
}

export function SpecsScreen({ data }: { data: ActiveCar }) {
  return (
    <div className="pb-tabbar">
      <PageHeader back title="مشخصات فنی" subtitle={data.model.name} />
      <div className="px-4">
        <Card className="divide-y divide-line overflow-hidden">
          <div className="px-4 py-3"><p className="text-xs text-muted">موتور</p><p className="font-semibold">{data.model.engine}</p></div>
          <div className="px-4 py-3"><p className="text-xs text-muted">گیربکس</p><p className="font-semibold">{data.car.transmission === 'auto' ? 'اتوماتیک' : 'دستی'}</p></div>
          {data.model.specs.map((s) => (
            <div key={s.label} className="px-4 py-3"><p className="text-xs text-muted">{s.label}</p><p className="font-semibold">{s.value}</p></div>
          ))}
        </Card>
        <p className="mt-3 px-1 text-xs leading-5 text-muted">مقادیر تقریبی هستند؛ همیشه با گیج یا دفترچه‌ی خودرو مطابقت بده.</p>
      </div>
    </div>
  )
}

export function NotificationsScreen() {
  const settings = useSettings()
  const [upcoming, setUpcoming] = useState<Reminder[]>([])
  const [server, setServer] = useState(settings.pushServer ?? '')
  const [busy, setBusy] = useState(false)
  const standalone = isStandalone()

  useEffect(() => {
    allReminders(30).then(setUpcoming)
  }, [settings])

  async function exportCalendar() {
    const reminders = await allReminders(365)
    const appUrl = `${location.origin}${import.meta.env.BASE_URL}`
    const r = await saveFile('carcare-reminders.ics', toICS(reminders, appUrl), 'text/calendar')
    if (r !== 'cancelled') toast(`${fmtNum(reminders.length)} یادآور آماده شد`)
  }

  async function togglePush() {
    setBusy(true)
    try {
      if (settings.pushServer) {
        await disablePush()
        toast('اعلان‌ها خاموش شد')
      } else {
        await enablePush(server)
        toast('اعلان‌ها فعال شد ✓')
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const kindIcon: Record<Reminder['kind'], string> = { check: '💧', odometer: '🔢', part: '🔧', symptom: '⚠️', backup: '💾' }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="اعلان‌ها و یادآورها" />
      <div className="px-4">
        <Card className="p-4">
          <p className="flex items-center gap-2 font-bold"><CalendarPlus className="size-5 text-accent" />یادآور در تقویم آیفون</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            مطمئن‌ترین روش بدون اینترنت و بدون سرور: یک فایل تقویم با همه‌ی یادآورهای یک سال آینده ساخته می‌شود. آن را باز کن و «Add All» را بزن. هر وقت کیلومتر یا تعویض جدید ثبت کردی، دوباره خروجی بگیر تا تاریخ‌ها به‌روز شوند.
          </p>
          <Button className="mt-3 w-full" onClick={exportCalendar}><CalendarPlus className="size-5" />افزودن یادآورها به تقویم</Button>
        </Card>

        <Card className="mt-3 p-4">
          <p className="flex items-center gap-2 font-bold"><Bell className="size-5 text-accent" />اعلان پوش (اختیاری)</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            آیفون فقط وقتی اعلان وب می‌دهد که یک سرور آن را بفرستد. اگر سرور رایگان Cloudflare را طبق راهنمای README راه انداختی، آدرسش را اینجا وارد کن. فقط متن و زمان یادآورها به سرور می‌رود.
          </p>
          {!pushSupported() || (isIOS() && !standalone) ? (
            <p className="mt-3 rounded-xl bg-warn/15 p-3 text-sm font-semibold text-warn">ابتدا برنامه را با Add to Home Screen نصب کن و از آیکن آن باز کن (iOS ۱۶.۴ به بالا).</p>
          ) : (
            <>
              {!settings.pushServer && (
                <div className="mt-3">
                  <TextInput dir="ltr" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://carcare-push.yourname.workers.dev" />
                </div>
              )}
              <Button variant={settings.pushServer ? 'danger' : 'primary'} className="mt-3 w-full" disabled={busy || (!settings.pushServer && !server.trim())} onClick={togglePush}>
                {settings.pushServer ? 'خاموش کردن اعلان‌ها' : 'فعال‌سازی اعلان‌ها'}
              </Button>
              {settings.pushServer && (
                <Button variant="secondary" className="mt-2 w-full" disabled={busy} onClick={async () => toast((await syncPush()) ? 'همگام شد ✓' : 'همگام‌سازی ناموفق بود')}>
                  همگام‌سازی دستی {settings.lastPushSync ? `(آخرین: ${fmtRelDays(settings.lastPushSync)})` : ''}
                </Button>
              )}
              {settings.pushServer && (
                <Button variant="ghost" className="mt-1 w-full" disabled={busy} onClick={async () => toast((await testPush().catch(() => false)) ? 'اعلان آزمایشی فرستاده شد' : 'ارسال ناموفق بود')}>
                  ارسال اعلان آزمایشی
                </Button>
              )}
            </>
          )}
        </Card>

        <SectionTitle>تنظیمات یادآوری</SectionTitle>
        <Card className="p-4">
          <Field label="ساعت یادآوری‌ها">
            <select className="min-h-12 w-full rounded-xl bg-surface-2 px-4" value={settings.notifyHour} onChange={(e) => updateSettings({ notifyHour: +e.target.value })}>
              {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{toFa(h)}:۰۰</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="چک در ماه (عادی)">
              <NumberInput value={settings.checksPerMonthNormal} onChange={(v) => v && v <= 8 && updateSettings({ checksPerMonthNormal: v })} />
            </Field>
            <Field label="چک در ماه (تابستان)">
              <NumberInput value={settings.checksPerMonthSummer} onChange={(v) => v && v <= 8 && updateSettings({ checksPerMonthSummer: v })} />
            </Field>
          </div>
          <p className="mb-2 text-sm font-semibold text-muted">ماه‌های تابستان</p>
          <div className="flex flex-wrap gap-2">
            {JALALI_MONTHS.map((m, i) => {
              const on = settings.summerMonths.includes(i + 1)
              return <Chip key={m} active={on} onClick={() => updateSettings({ summerMonths: on ? settings.summerMonths.filter((x) => x !== i + 1) : [...settings.summerMonths, i + 1] })}>{m}</Chip>
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="یادآوری کیلومتر (روز)">
              <NumberInput value={settings.odometerPromptDays} onChange={(v) => v && updateSettings({ odometerPromptDays: v })} />
            </Field>
            <Field label="یادآوری پشتیبان (روز)">
              <NumberInput value={settings.backupReminderDays} onChange={(v) => v && updateSettings({ backupReminderDays: v })} />
            </Field>
          </div>
        </Card>

        <SectionTitle>۳۰ روز آینده ({toFa(upcoming.length)})</SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          {upcoming.length === 0 && <p className="p-4 text-sm text-muted">یادآوری در ۳۰ روز آینده نیست.</p>}
          {upcoming.slice(0, 40).map((r) => (
            <div key={r.id} className="flex gap-3 px-4 py-3">
              <span className="text-xl">{kindIcon[r.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-xs text-muted">{fmtDate(r.at, true)} • {fmtRelDays(r.at)}</span>
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

export function BackupScreen() {
  const settings = useSettings()

  async function backup() {
    const json = await exportAll()
    const { jy, jm, jd } = jalali(Date.now())
    const r = await saveFile(`carcare-backup-${jy}-${jm}-${jd}.json`, json, 'application/json')
    if (r === 'cancelled') return
    await updateSettings({ lastBackupAt: Date.now() })
    toast('پشتیبان آماده شد ✓')
  }

  async function restore() {
    const text = await pickFile('application/json,.json')
    if (!text) return
    if (!confirm('همه‌ی اطلاعات فعلی با فایل پشتیبان جایگزین می‌شود. ادامه؟')) return
    try {
      await importAll(text)
      toast('بازیابی شد ✓')
      navigate('', true)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="پشتیبان‌گیری" />
      <div className="space-y-3 px-4">
        <Card className="p-4">
          <p className="leading-7">
            همه‌ی اطلاعات فقط داخل همین برنامه روی آیفونت ذخیره می‌شود. اگر برنامه را از صفحه‌ی اصلی پاک کنی یا Safari داده‌ها را حذف کند، اطلاعات از بین می‌رود؛ پس هر چند وقت یک بار پشتیبان بگیر.
          </p>
          <p className="mt-2 text-sm text-muted">در منوی Share گزینه‌ی <b>Save to Files</b> را بزن و یک پوشه (مثلاً iCloud Drive) انتخاب کن.</p>
          <p className="mt-3 text-sm font-semibold">{settings.lastBackupAt ? `آخرین پشتیبان: ${fmtDate(settings.lastBackupAt)} (${fmtRelDays(settings.lastBackupAt)})` : 'هنوز پشتیبانی گرفته نشده'}</p>
        </Card>
        <Button className="w-full" onClick={backup}><Download className="size-5" />ساخت فایل پشتیبان</Button>
        <Button variant="secondary" className="w-full" onClick={restore}><Upload className="size-5" />بازیابی از فایل</Button>
      </div>
    </div>
  )
}

type HistoryItem = { date: number; kind: 'service' | 'odo' | 'check' | 'symptom'; title: string; sub: string; go?: string }

export function HistoryScreen({ data }: { data: ActiveCar }) {
  const [kind, setKind] = useState<HistoryItem['kind'] | 'all'>('all')
  const partName = (id: string) => data.model.parts.find((p) => p.id === id)?.name ?? id
  const items: HistoryItem[] = [
    ...data.services.map((s) => ({ date: s.date, kind: 'service' as const, title: partName(s.partId), sub: `${fmtKm(s.km)}${s.cost ? ` • ${fmtToman(s.cost)}` : ''}${s.shop ? ` • ${s.shop}` : ''}`, go: `part/${s.partId}` })),
    ...data.readings.map((r) => ({ date: r.date, kind: 'odo' as const, title: `کیلومتر: ${fmtNum(r.km)}`, sub: '' })),
    ...data.checks.map((c) => ({ date: c.date, kind: 'check' as const, title: 'چک دوره‌ای', sub: c.items.map((i) => CHECK_ITEMS.find((x) => x.id === i)?.name).filter(Boolean).join('، ') })),
    ...data.symptoms.map((s) => ({ date: s.date, kind: 'symptom' as const, title: s.title, sub: `${SYMPTOM_CATEGORIES[s.category]} • ${s.status === 'open' ? 'باز' : 'برطرف‌شده'}`, go: `symptom/${s.id}` })),
  ]
    .filter((i) => kind === 'all' || i.kind === kind)
    .sort((a, b) => b.date - a.date)

  const meta = { service: { c: '#17b26a', icon: <Wrench className="size-4" /> }, odo: { c: '#2f6bff', icon: <span className="text-[10px] font-black">KM</span> }, check: { c: '#06b6d4', icon: <span>💧</span> }, symptom: { c: '#e5484d', icon: <span>!</span> } }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="تاریخچه" subtitle={data.car.name} />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
        {([['all', 'همه'], ['service', 'تعویض‌ها'], ['odo', 'کیلومتر'], ['check', 'چک‌ها'], ['symptom', 'علائم']] as const).map(([k, l]) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{l}</Chip>
        ))}
      </div>
      <div className="px-4">
        {!items.length && <Empty icon={<History className="size-8" />} title="هنوز چیزی ثبت نشده" />}
        <ol className="relative ms-3 border-s-2 border-line">
          {items.map((i, idx) => (
            <li key={idx} className="mb-3 ms-5">
              <span className="absolute -start-[13px] grid size-6 place-items-center rounded-full text-white ring-4 ring-bg" style={{ background: meta[i.kind].c }}>{meta[i.kind].icon}</span>
              <button disabled={!i.go} onClick={() => i.go && navigate(i.go)} className="w-full rounded-2xl bg-surface p-3 text-start ring-1 ring-line">
                <p className="text-xs text-muted">{fmtDateShort(i.date)}</p>
                <p className="font-semibold">{i.title}</p>
                {i.sub && <p className="truncate text-xs text-muted">{i.sub}</p>}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function CostsScreen({ data }: { data: ActiveCar }) {
  const services = data.services.filter((s) => s.cost)
  const total = services.reduce((a, s) => a + s.cost!, 0)
  const now = jalali(Date.now())
  const thisYear = services.filter((s) => jalali(s.date).jy === now.jy).reduce((a, s) => a + s.cost!, 0)

  const byCat = new Map<CategoryId, number>()
  for (const s of services) {
    const cat = data.model.parts.find((p) => p.id === s.partId)?.category ?? 'body'
    byCat.set(cat, (byCat.get(cat) ?? 0) + s.cost!)
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(1, ...cats.map((c) => c[1]))

  // Last 12 Jalali months
  const months: { label: string; value: number }[] = []
  for (let i = 11; i >= 0; i--) {
    let m = now.jm - i
    let y = now.jy
    while (m < 1) {
      m += 12
      y--
    }
    const value = services.filter((s) => {
      const j = jalali(s.date)
      return j.jy === y && j.jm === m
    }).reduce((a, s) => a + s.cost!, 0)
    months.push({ label: JALALI_MONTHS[m - 1].slice(0, 3), value })
  }
  const maxM = Math.max(1, ...months.map((m) => m.value))

  const firstKm = Math.min(...data.services.map((s) => s.km), ...data.readings.map((r) => r.km))
  const lastKm = Math.max(...data.services.map((s) => s.km), ...data.readings.map((r) => r.km))
  const perKm = lastKm > firstKm ? total / (lastKm - firstKm) : 0

  return (
    <div className="pb-tabbar">
      <PageHeader back title="هزینه‌ها" subtitle={data.car.name} />
      <div className="px-4">
        {!services.length ? (
          <Empty icon={<ChartColumn className="size-8" />} title="هزینه‌ای ثبت نشده" text="موقع ثبت تعویض، هزینه را هم وارد کن تا اینجا گزارش ببینی." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-4"><p className="text-xs text-muted">امسال ({toFa(now.jy)})</p><p className="mt-1 font-black">{fmtToman(thisYear)}</p></Card>
              <Card className="p-4"><p className="text-xs text-muted">کل</p><p className="mt-1 font-black">{fmtToman(total)}</p></Card>
              {perKm > 0 && <Card className="col-span-2 p-4"><p className="text-xs text-muted">هزینه‌ی نگهداری به ازای هر کیلومتر</p><p className="mt-1 font-black">{fmtNum(perKm)} تومان</p></Card>}
            </div>
            <SectionTitle>۱۲ ماه اخیر</SectionTitle>
            <Card className="p-4">
              <div className="flex h-36 items-end gap-1.5">
                {months.map((m, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end" title={fmtToman(m.value)}>
                    <div className={cx('w-full rounded-t-md', m.value ? 'bg-accent' : 'bg-surface-2')} style={{ height: `${Math.max(3, (m.value / maxM) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1.5 text-center text-[9px] text-muted">
                {months.map((m, i) => <span key={i} className="flex-1 truncate">{m.label}</span>)}
              </div>
            </Card>
            <SectionTitle>بر اساس دسته</SectionTitle>
            <Card className="space-y-3 p-4">
              {cats.map(([c, v]) => (
                <div key={c}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{CATEGORIES[c].name}</span><span className="text-muted">{fmtToman(v)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(v / maxCat) * 100}%`, background: CATEGORIES[c].color }} /></div>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
