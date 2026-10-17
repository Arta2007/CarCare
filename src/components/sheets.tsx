import { useMemo, useState } from 'react'
import { Check, ClipboardCheck, Droplets, Gauge, Search, Siren, Trash2, Wrench } from 'lucide-react'
import { db } from '../lib/db'
import { closeSheet, openSheet, useSheet } from '../lib/sheets'
import { newVisitId, type ActiveCar } from '../lib/store'
import { allStatuses, estimateKmNow, latestKm } from '../lib/maintenance'
import { CATEGORIES, CHECK_ITEMS, SYMPTOM_CATEGORIES } from '../data/catalog'
import { DAY, fmtDate, fmtKm, fmtNum, fmtRelDays } from '../lib/format'
import type { CategoryId, SymptomCategory } from '../lib/types'
import { Button, Chip, cx, DateInput, Field, NumberInput, Segmented, Sheet, TextArea, TextInput, toast } from './ui'

export function SheetHost({ data }: { data: ActiveCar }) {
  const s = useSheet()
  return (
    <>
      <ActionsSheet open={s?.type === 'actions'} />
      {s?.type === 'odometer' && <OdometerSheet data={data} />}
      {s?.type === 'service' && <ServiceSheet data={data} partIds={s.partIds} editId={s.editId} />}
      {s?.type === 'symptom' && <SymptomSheet data={data} editId={s.editId} />}
      {s?.type === 'check' && <CheckSheet data={data} />}
    </>
  )
}

function ActionsSheet({ open }: { open: boolean }) {
  const items = [
    { icon: <Gauge />, label: 'ثبت کیلومتر', desc: 'عدد فعلی کیلومترشمار', color: '#2f6bff', go: () => openSheet({ type: 'odometer' }) },
    { icon: <Wrench />, label: 'ثبت تعویض / سرویس', desc: 'روغن، فیلتر، لنت و…', color: '#17b26a', go: () => openSheet({ type: 'service' }) },
    { icon: <Siren />, label: 'ثبت علامت یا خرابی', desc: 'صدا، لرزش، نشتی، چراغ', color: '#e5484d', go: () => openSheet({ type: 'symptom' }) },
    { icon: <Droplets />, label: 'چک مایعات و ظاهر', desc: 'آب، روغن، باد لاستیک', color: '#06b6d4', go: () => openSheet({ type: 'check' }) },
  ]
  return (
    <Sheet open={open} onClose={closeSheet} title="ثبت جدید">
      <div className="grid grid-cols-2 gap-3 pb-4">
        {items.map((i) => (
          <button key={i.label} onClick={i.go} className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-4 text-start ring-1 ring-line transition active:scale-[0.98]">
            <span className="grid size-11 place-items-center rounded-xl text-white [&>svg]:size-6" style={{ background: i.color }}>
              {i.icon}
            </span>
            <span>
              <span className="block font-bold">{i.label}</span>
              <span className="block text-xs text-muted">{i.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function OdometerSheet({ data }: { data: ActiveCar }) {
  const latest = latestKm(data.readings, data.services)
  const estimate = estimateKmNow(data)
  const [km, setKm] = useState<number | undefined>()
  const [date, setDate] = useState(Date.now())
  const tooLow = km !== undefined && latest !== undefined && km < latest.km && date >= latest.date

  async function save() {
    if (km === undefined) return
    await db.odometer.add({ carId: data.car.id!, km, date })
    const after = allStatuses({ ...data, readings: [...data.readings, { carId: data.car.id!, km, date }], now: Date.now() })
    const due = after.filter((s) => s.state === 'overdue' || s.state === 'soon').length
    toast(due ? `ثبت شد — ${fmtNum(due)} مورد نیاز به توجه دارد` : 'کیلومتر ثبت شد ✓')
    closeSheet()
  }

  return (
    <Sheet open onClose={closeSheet} title="ثبت کیلومتر" footer={<Button className="w-full" disabled={km === undefined || tooLow} onClick={save}>ذخیره</Button>}>
      <div className="mb-4 rounded-2xl bg-surface p-4 text-center ring-1 ring-line">
        {latest ? (
          <>
            <p className="text-sm text-muted">آخرین ثبت: {fmtKm(latest.km)} — {fmtRelDays(latest.date)}</p>
            <p className="mt-1 text-xs text-muted">تخمین امروز: حدود {fmtKm(estimate)}</p>
          </>
        ) : (
          <p className="text-sm text-muted">اولین عدد کیلومتر را وارد کن</p>
        )}
      </div>
      <Field label="کیلومتر فعلی">
        <NumberInput large autoFocus value={km} onChange={setKm} placeholder={latest ? fmtNum(estimate) : '۰'} suffix="km" />
      </Field>
      {tooLow && <p className="-mt-2 mb-3 text-sm font-semibold text-danger">این عدد از آخرین کیلومتر ثبت‌شده کمتر است.</p>}
      <Field label="تاریخ">
        <DateInput value={date} onChange={setDate} />
      </Field>
    </Sheet>
  )
}

function ServiceSheet({ data, partIds, editId }: { data: ActiveCar; partIds?: string[]; editId?: number }) {
  const editing = editId !== undefined ? data.services.find((s) => s.id === editId) : undefined
  const latest = latestKm(data.readings, data.services)
  const [selected, setSelected] = useState<string[]>(editing ? [editing.partId] : (partIds ?? []))
  const [km, setKm] = useState<number | undefined>(editing?.km ?? latest?.km)
  const [date, setDate] = useState(editing?.date ?? Date.now())
  const [costs, setCosts] = useState<Record<string, number | undefined>>(editing ? { [editing.partId]: editing.cost } : {})
  const [brand, setBrand] = useState<Record<string, string>>(editing ? { [editing.partId]: editing.brand ?? '' } : {})
  const [shop, setShop] = useState(editing?.shop ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CategoryId | 'all'>('all')

  const statuses = useMemo(() => allStatuses(data), [data])
  const byId = useMemo(() => Object.fromEntries(data.parts.map((p) => [p.id, p])), [data.parts])
  const visible = statuses.filter((s) => (cat === 'all' || s.part.category === cat) && (!q || s.part.name.includes(q)))
  const cats = [...new Set(data.parts.map((p) => p.category))]

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  async function save() {
    if (km === undefined || !selected.length) return
    if (editing) {
      await db.services.update(editing.id!, { km, date, cost: costs[editing.partId], brand: brand[editing.partId] || undefined, shop: shop || undefined, notes: notes || undefined })
      toast('ویرایش شد ✓')
    } else {
      const visitId = newVisitId()
      await db.services.bulkAdd(
        selected.map((partId) => ({ carId: data.car.id!, partId, km, date, visitId, cost: costs[partId], brand: brand[partId] || undefined, shop: shop || undefined, notes: notes || undefined })),
      )
      toast(`${fmtNum(selected.length)} مورد ثبت شد ✓`)
    }
    closeSheet()
  }

  async function remove() {
    if (!editing || !confirm('این رکورد حذف شود؟')) return
    await db.services.delete(editing.id!)
    toast('حذف شد')
    closeSheet()
  }

  const total = selected.reduce((a, id) => a + (costs[id] ?? 0), 0)

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={editing ? 'ویرایش تعویض' : 'ثبت تعویض / سرویس'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button variant="danger" onClick={remove} aria-label="حذف">
              <Trash2 className="size-5" />
            </Button>
          )}
          <Button className="flex-1" disabled={km === undefined || !selected.length} onClick={save}>
            {editing ? 'ذخیره' : selected.length ? `ثبت ${fmtNum(selected.length)} مورد${total ? ` — ${fmtNum(total)} تومان` : ''}` : 'قطعه‌ای انتخاب نشده'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-0">
        <Field label="کیلومتر هنگام تعویض">
          <NumberInput value={km} onChange={setKm} suffix="کیلومتر" />
        </Field>
        <Field label="تاریخ">
          <DateInput value={date} onChange={setDate} />
        </Field>
      </div>

      {!editing && (
        <>
          <p className="mb-2 text-sm font-semibold text-muted">چه چیزهایی عوض شد؟ (چند مورد را با هم انتخاب کن)</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی قطعه…" className="ps-10" />
          </div>
          <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
            <Chip active={cat === 'all'} onClick={() => setCat('all')}>همه</Chip>
            {cats.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} color={CATEGORIES[c].color}>{CATEGORIES[c].name}</Chip>
            ))}
          </div>
          <div className="mb-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            {visible.map((s) => {
              const on = selected.includes(s.part.id)
              return (
                <button key={s.part.id} onClick={() => toggle(s.part.id)} className="flex min-h-13 w-full items-center gap-3 border-b border-line px-4 py-2.5 text-start last:border-0 active:bg-surface-2">
                  <span className={cx('grid size-6 shrink-0 place-items-center rounded-md ring-2 transition', on ? 'bg-accent text-white ring-accent' : 'ring-line')}>
                    {on && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.part.name}</span>
                    <span className="block text-xs text-muted">
                      {CATEGORIES[s.part.category].name}
                      {s.state === 'overdue' && <span className="text-danger"> • موعدش گذشته</span>}
                      {s.state === 'soon' && <span className="text-warn"> • نزدیک موعد</span>}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {selected.length > 0 && (
        <>
          <p className="mb-2 text-sm font-semibold text-muted">هزینه و برند (اختیاری)</p>
          <div className="mb-4 space-y-2">
            {selected.map((id) => (
              <div key={id} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
                <p className="mb-2 font-semibold">{byId[id]?.name ?? id}</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput value={costs[id]} onChange={(v) => setCosts((c) => ({ ...c, [id]: v }))} placeholder="هزینه (تومان)" />
                  <TextInput value={brand[id] ?? ''} onChange={(e) => setBrand((b) => ({ ...b, [id]: e.target.value }))} placeholder="برند" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <Field label="تعمیرگاه / فروشگاه">
        <TextInput value={shop} onChange={(e) => setShop(e.target.value)} placeholder="اختیاری" />
      </Field>
      <Field label="یادداشت">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً نوع روغن، گرانروی…" />
      </Field>
    </Sheet>
  )
}

function SymptomSheet({ data, editId }: { data: ActiveCar; editId?: number }) {
  const editing = editId !== undefined ? data.symptoms.find((s) => s.id === editId) : undefined
  const latest = latestKm(data.readings, data.services)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [category, setCategory] = useState<SymptomCategory>(editing?.category ?? 'sound')
  const [severity, setSeverity] = useState<1 | 2 | 3>(editing?.severity ?? 2)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [km, setKm] = useState<number | undefined>(editing?.km ?? latest?.km)
  const [date, setDate] = useState(editing?.date ?? Date.now())
  const [remindAt, setRemindAt] = useState(editing?.remindAt ?? Date.now() + data.settings.symptomFollowupDays * DAY)

  async function save() {
    if (!title.trim()) return
    const rec = { carId: data.car.id!, title: title.trim(), category, severity, description: description || undefined, km, date, remindAt }
    if (editing) await db.symptoms.update(editing.id!, rec)
    else await db.symptoms.add({ ...rec, status: 'open' })
    toast(editing ? 'ویرایش شد ✓' : `ثبت شد — ${fmtDate(remindAt)} یادآوری می‌کنم`)
    closeSheet()
  }

  const suggestions: Record<SymptomCategory, string[]> = {
    sound: ['صدای جیرجیر هنگام ترمز', 'صدای تق‌تق از جلوبندی', 'صدای سوت از موتور', 'صدای زوزه هنگام شتاب'],
    vibration: ['لرزش فرمان در سرعت بالا', 'لرزش موتور در درجا', 'لرزش هنگام ترمز'],
    leak: ['لکه روغن زیر موتور', 'کم شدن آب رادیاتور', 'نشتی روغن گیربکس'],
    warning: ['چراغ چک موتور روشن شد', 'چراغ روغن', 'چراغ ABS', 'چراغ باتری'],
    smell: ['بوی سوختگی', 'بوی بنزین', 'بوی شیرین (ضدیخ)'],
    smoke: ['دود سفید از اگزوز', 'دود آبی از اگزوز', 'دود سیاه'],
    brake: ['ترمز نرم شده', 'کشیدن ماشین هنگام ترمز', 'پدال ترمز می‌لرزد'],
    steering: ['فرمان سنگین شده', 'کشیدن فرمان به یک طرف', 'لقی فرمان'],
    electrical: ['دیر روشن شدن', 'ضعیف شدن نور چراغ', 'خاموش شدن ناگهانی'],
    ac: ['کولر خنک نمی‌کند', 'بخاری گرم نمی‌کند', 'صدا از فن'],
    other: [],
  }

  return (
    <Sheet open onClose={closeSheet} title={editing ? 'ویرایش علامت' : 'ثبت علامت یا خرابی جدید'} footer={<Button className="w-full" disabled={!title.trim()} onClick={save}>ذخیره</Button>}>
      <p className="mb-2 text-sm font-semibold text-muted">نوع</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(SYMPTOM_CATEGORIES) as SymptomCategory[]).map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{SYMPTOM_CATEGORIES[c]}</Chip>
        ))}
      </div>
      <Field label="چه اتفاقی افتاده؟">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً صدای جیرجیر هنگام ترمز" />
      </Field>
      {!editing && suggestions[category].length > 0 && (
        <div className="no-scrollbar -mx-5 -mt-2 mb-4 flex gap-2 overflow-x-auto px-5">
          {suggestions[category].map((s) => (
            <button key={s} onClick={() => setTitle(s)} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">{s}</button>
          ))}
        </div>
      )}
      <Field label="شدت">
        <Segmented value={severity} onChange={setSeverity} options={[{ value: 1, label: 'جزئی' }, { value: 2, label: 'متوسط' }, { value: 3, label: 'جدی' }]} />
      </Field>
      <Field label="توضیحات" hint="کِی اتفاق می‌افتد؟ سرد یا گرم؟ در چه سرعتی؟ — این جزئیات به تعمیرکار کمک می‌کند">
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="کیلومتر">
        <NumberInput value={km} onChange={setKm} suffix="کیلومتر" />
      </Field>
      <Field label="تاریخ مشاهده">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <Field label="کِی یادآوری کنم؟">
        <DateInput value={remindAt} onChange={setRemindAt} />
      </Field>
    </Sheet>
  )
}

function CheckSheet({ data }: { data: ActiveCar }) {
  const [items, setItems] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const last = data.checks.reduce((a, c) => Math.max(a, c.date), 0)

  async function save() {
    await db.checks.add({ carId: data.car.id!, date: Date.now(), items, notes: notes || undefined })
    toast('چک ثبت شد ✓')
    closeSheet()
    if (notes.trim()) openSheet({ type: 'symptom' })
  }

  const all = items.length === CHECK_ITEMS.length
  return (
    <Sheet
      open
      onClose={closeSheet}
      title="چک دوره‌ای"
      footer={<Button className="w-full" disabled={!items.length} onClick={save}><ClipboardCheck className="size-5" />ثبت چک ({fmtNum(items.length)} از {fmtNum(CHECK_ITEMS.length)})</Button>}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">{last ? `آخرین چک: ${fmtRelDays(last)}` : 'هنوز چکی ثبت نشده'}</p>
        <button className="text-sm font-bold text-accent" onClick={() => setItems(all ? [] : CHECK_ITEMS.map((i) => i.id))}>{all ? 'هیچ‌کدام' : 'همه'}</button>
      </div>
      <div className="mb-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {CHECK_ITEMS.map((i) => {
          const on = items.includes(i.id)
          return (
            <button key={i.id} onClick={() => setItems((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-start last:border-0 active:bg-surface-2">
              <span className={cx('grid size-7 shrink-0 place-items-center rounded-full ring-2 transition', on ? 'bg-ok text-white ring-ok' : 'ring-line')}>
                {on && <Check className="size-4" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block font-semibold', on && 'text-muted line-through')}>{i.name}</span>
                {i.hint && <span className="block text-xs text-muted">{i.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <Field label="چیز غیرعادی دیدی؟" hint="اگر بنویسی، بعد از ذخیره فرم ثبت خرابی باز می‌شود">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً آب رادیاتور کم شده بود" />
      </Field>
    </Sheet>
  )
}
