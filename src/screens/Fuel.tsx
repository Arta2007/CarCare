import { Fuel, Plus } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { fuelSegments, fuelStats } from '../lib/fuel'
import { openSheet } from '../lib/sheets'
import { updateSettings } from '../lib/db'
import { fmtDateShort, fmtKm, fmtNum, fmtToman, toFa } from '../lib/format'
import { Button, Card, cx, Empty, NumberInput, PageHeader, SectionTitle } from '../components/ui'

function fmtL(n: number, digits = 1) {
  return toFa(n.toFixed(digits))
}

export function FuelScreen({ data }: { data: ActiveCar }) {
  const stats = fuelStats(data.fuel)
  const segs = fuelSegments(data.fuel).slice(-12)
  const maxC = Math.max(1, ...segs.map((s) => s.consumption))
  const quota = data.settings.fuelQuota
  const quotaPct = quota ? Math.min(1, stats.litersThisMonth / quota) : 0
  const list = [...data.fuel].sort((a, b) => b.date - a.date || b.km - a.km)

  return (
    <div className="pb-tabbar">
      <PageHeader
        back
        title="سوخت"
        subtitle={data.car.name}
        action={<button aria-label="ثبت سوخت" onClick={() => openSheet({ type: 'fuel' })} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg"><Plus className="size-6" /></button>}
      />
      <div className="px-4">
        {!data.fuel.length ? (
          <Empty
            icon={<Fuel className="size-8" />}
            title="سوخت‌گیری ثبت نشده"
            text="هر بار بنزین زدی، کیلومتر و لیتر را ثبت کن. با دو بار «باک پر» پشت سر هم، مصرف واقعی در هر ۱۰۰ کیلومتر محاسبه می‌شود."
            action={<Button onClick={() => openSheet({ type: 'fuel' })}><Plus className="size-5" />ثبت سوخت‌گیری</Button>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-4">
                <p className="text-xs text-muted">میانگین مصرف</p>
                <p className="mt-1 text-2xl font-black">{stats.avg ? fmtL(stats.avg) : '—'}<span className="ms-1 text-xs font-semibold text-muted">لیتر/۱۰۰</span></p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">آخرین مصرف</p>
                <p className="mt-1 text-2xl font-black" style={{ color: stats.last && stats.avg ? (stats.last > stats.avg * 1.15 ? 'var(--danger)' : 'var(--fg)') : undefined }}>
                  {stats.last ? fmtL(stats.last) : '—'}<span className="ms-1 text-xs font-semibold text-muted">لیتر/۱۰۰</span>
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">هزینه‌ی این ماه</p>
                <p className="mt-1 font-black">{stats.costThisMonth ? fmtToman(stats.costThisMonth) : '—'}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted">هزینه به ازای هر کیلومتر</p>
                <p className="mt-1 font-black">{stats.costPerKm ? `${fmtNum(stats.costPerKm)} تومان` : '—'}</p>
              </Card>
            </div>
            {stats.last && stats.avg && stats.last > stats.avg * 1.15 && (
              <p className="mt-2 rounded-xl bg-danger/10 p-3 text-sm font-semibold leading-6 text-danger">مصرف اخیر بیش از ۱۵٪ بالاتر از میانگین است. فیلتر هوا، شمع، باد لاستیک یا سنسور اکسیژن را بررسی کن.</p>
            )}

            <SectionTitle>سهمیه‌ی کارت سوخت این ماه</SectionTitle>
            <Card className="p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-lg font-black">{fmtL(stats.litersThisMonth, 0)} <span className="text-sm font-semibold text-muted">از {toFa(quota)} لیتر</span></span>
                <span className={cx('text-sm font-bold', quotaPct >= 1 ? 'text-danger' : quotaPct > 0.8 ? 'text-warn' : 'text-ok')}>{toFa(Math.round(quotaPct * 100))}٪</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${quotaPct * 100}%`, background: quotaPct >= 1 ? 'var(--danger)' : quotaPct > 0.8 ? 'var(--warn)' : 'var(--ok)' }} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                <span className="shrink-0">سهمیه‌ی ماهانه:</span>
                <div className="w-24"><NumberInput value={quota} onChange={(v) => v && updateSettings({ fuelQuota: v })} /></div>
                <span>لیتر</span>
              </div>
            </Card>

            {segs.length > 1 && (
              <>
                <SectionTitle>روند مصرف (لیتر در ۱۰۰ کیلومتر)</SectionTitle>
                <Card className="p-4">
                  <div className="flex h-32 items-end gap-1.5">
                    {segs.map((s) => (
                      <div key={s.end.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[9px] font-semibold text-muted">{fmtL(s.consumption)}</span>
                        <div className="w-full rounded-t-md bg-accent" style={{ height: `${(s.consumption / maxC) * 85}%` }} />
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            <SectionTitle>سوخت‌گیری‌ها</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {list.map((f) => (
                <button key={f.id} onClick={() => openSheet({ type: 'fuel', editId: f.id })} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
                  <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', f.full ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted')}><Fuel className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{fmtL(f.liters)} لیتر{f.full ? ' • باک پر' : ''}</span>
                    <span className="block truncate text-xs text-muted">{fmtDateShort(f.date)} • {fmtKm(f.km)}{f.cost ? ` • ${fmtToman(f.cost)}` : ''}{f.station ? ` • ${f.station}` : ''}</span>
                  </span>
                </button>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
