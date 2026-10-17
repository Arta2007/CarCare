import { useMemo, useState } from 'react'
import { History, Info, Pencil, Plus, ShieldAlert } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { allStatuses, partStatus } from '../lib/maintenance'
import { openSheet } from '../lib/sheets'
import { CATEGORIES } from '../data/catalog'
import { fmtDate, fmtKm, fmtNum, fmtRelDays, fmtToman, toFa } from '../lib/format'
import type { CategoryId } from '../lib/types'
import { Button, Card, Chip, Empty, PageHeader, Progress, SectionTitle, StateBadge } from '../components/ui'
import { DueRow } from './Home'

type Filter = 'all' | 'attention' | 'unknown'

export function PartsScreen({ data, initialFilter }: { data: ActiveCar; initialFilter?: string }) {
  const [filter, setFilter] = useState<Filter>((['attention', 'unknown'].includes(initialFilter ?? '') ? initialFilter : 'all') as Filter)
  const statuses = useMemo(() => allStatuses(data), [data])
  const shown = statuses.filter((s) => (filter === 'all' ? true : filter === 'attention' ? s.state === 'overdue' || s.state === 'soon' : s.state === 'unknown'))
  const groups = new Map<CategoryId, typeof shown>()
  for (const s of shown) groups.set(s.part.category, [...(groups.get(s.part.category) ?? []), s])
  const order = Object.keys(CATEGORIES) as CategoryId[]

  return (
    <div className="pb-tabbar">
      <PageHeader
        title="قطعات و سرویس‌ها"
        subtitle={data.car.name}
        action={
          <button aria-label="ثبت تعویض" onClick={() => openSheet({ type: 'service' })} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>همه ({toFa(statuses.length)})</Chip>
        <Chip active={filter === 'attention'} onClick={() => setFilter('attention')}>نیاز به توجه ({toFa(statuses.filter((s) => s.state === 'overdue' || s.state === 'soon').length)})</Chip>
        <Chip active={filter === 'unknown'} onClick={() => setFilter('unknown')}>بدون سابقه ({toFa(statuses.filter((s) => s.state === 'unknown').length)})</Chip>
      </div>
      <div className="px-4">
        {!shown.length && <Empty icon={<ShieldAlert className="size-8" />} title="موردی نیست" text={filter === 'attention' ? 'فعلاً هیچ قطعه‌ای نزدیک موعد نیست.' : 'همه‌ی قطعات سابقه دارند.'} />}
        {order
          .filter((c) => groups.has(c))
          .map((c) => (
            <section key={c}>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: CATEGORIES[c].color }} />
                  {CATEGORIES[c].name}
                </span>
              </SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {groups.get(c)!.map((s) =>
                  s.state === 'unknown' || s.state === 'untracked' ? (
                    <UnknownRow key={s.part.id} name={s.part.name} id={s.part.id} untracked={s.state === 'untracked'} interval={s.part.intervalKm} />
                  ) : (
                    <DueRow key={s.part.id} s={s} />
                  ),
                )}
              </Card>
            </section>
          ))}
      </div>
    </div>
  )
}

function UnknownRow({ name, id, untracked, interval }: { name: string; id: string; untracked: boolean; interval?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <button onClick={() => (location.hash = `#/part/${id}`)} className="min-w-0 flex-1 text-start">
        <span className="block truncate font-semibold">{name}</span>
        <span className="block text-xs text-muted">{untracked ? 'بدون دوره‌ی ثابت — فقط سابقه' : interval ? `هر ${fmtKm(interval)}` : 'دوره‌ای زمانی'}</span>
      </button>
      <button onClick={() => openSheet({ type: 'service', partIds: [id] })} className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent">ثبت تعویض</button>
    </div>
  )
}

export function PartDetail({ data, partId }: { data: ActiveCar; partId: string }) {
  const part = data.model.parts.find((p) => p.id === partId)
  if (!part) return <Empty icon={<Info />} title="قطعه پیدا نشد" />
  const s = partStatus(part, data)
  const history = data.services.filter((r) => r.partId === partId).sort((a, b) => b.date - a.date || b.km - a.km)
  const spent = history.reduce((a, r) => a + (r.cost ?? 0), 0)
  // Real-world lifetime from consecutive replacements
  const lifetimes = history.slice(0, -1).map((r, i) => r.km - history[i + 1].km).filter((x) => x > 0)
  const avgLife = lifetimes.length ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length : undefined

  return (
    <div className="pb-tabbar">
      <PageHeader back title={part.name} subtitle={CATEGORIES[part.category].name} />
      <div className="px-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted">وضعیت</span>
            <StateBadge state={s.state} />
          </div>
          {s.state !== 'unknown' && s.state !== 'untracked' && (
            <>
              <Progress value={s.progress} state={s.state} />
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {s.dueKm !== undefined && <Stat label="موعد در کیلومتر" value={fmtNum(s.dueKm)} />}
                {s.kmLeft !== undefined && <Stat label={s.kmLeft <= 0 ? 'گذشته' : 'مانده'} value={fmtKm(Math.abs(s.kmLeft))} />}
                {s.dueDate && <Stat label={s.dueDateEstimated ? 'تاریخ تخمینی' : 'موعد زمانی'} value={fmtDate(s.dueDate)} />}
                {s.dueDate && <Stat label="فاصله" value={fmtRelDays(s.dueDate)} />}
              </div>
            </>
          )}
          {s.state === 'unknown' && <p className="text-sm leading-6 text-muted">آخرین باری که این قطعه عوض شده را ثبت کن (حتی تقریبی) تا یادآوری فعال شود.</p>}
          <Button className="mt-4 w-full" onClick={() => openSheet({ type: 'service', partIds: [partId] })}>
            <Plus className="size-5" /> ثبت تعویض این قطعه
          </Button>
        </Card>

        <SectionTitle>مشخصات</SectionTitle>
        <Card className="grid grid-cols-2 gap-3 p-4 text-sm">
          <Stat label="دوره‌ی کیلومتری" value={part.intervalKm ? fmtKm(part.intervalKm) : '—'} />
          <Stat label="دوره‌ی زمانی" value={part.intervalMonths ? `${toFa(part.intervalMonths)} ماه` : '—'} />
          <Stat label="هزینه‌ی تقریبی" value={part.price ? fmtToman(part.price) : '—'} />
          {avgLife && <Stat label="عمر واقعی در ماشین شما" value={fmtKm(avgLife)} />}
          {part.note && <p className="col-span-2 rounded-xl bg-surface-2 p-3 leading-6 text-muted">{part.note}</p>}
          {part.critical && <p className="col-span-2 rounded-xl bg-danger/10 p-3 font-semibold leading-6 text-danger">قطعه‌ی حیاتی — عقب انداختن آن می‌تواند به موتور یا گیربکس آسیب جدی بزند.</p>}
        </Card>

        <SectionTitle>{`سابقه‌ی تعویض (${toFa(history.length)})${spent ? ` — ${fmtToman(spent)}` : ''}`}</SectionTitle>
        {!history.length ? (
          <Card className="p-2"><Empty icon={<History className="size-8" />} title="هنوز سابقه‌ای نیست" /></Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {history.map((r, i) => (
              <button key={r.id} onClick={() => openSheet({ type: 'service', editId: r.id })} className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted">{toFa(history.length - i)}</span>
                <span className="min-w-0 flex-1">
                  <span className="tnum block font-semibold">{fmtKm(r.km)}</span>
                  <span className="block truncate text-xs text-muted">
                    {fmtDate(r.date)}
                    {r.brand && ` • ${r.brand}`}
                    {r.shop && ` • ${r.shop}`}
                    {r.cost ? ` • ${fmtToman(r.cost)}` : ''}
                  </span>
                  {r.notes && <span className="block truncate text-xs text-muted">{r.notes}</span>}
                </span>
                <Pencil className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-0.5 font-bold">{value}</p>
    </div>
  )
}
