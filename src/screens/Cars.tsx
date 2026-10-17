import { useState } from 'react'
import { CarFront, Check, Plus, Trash2 } from 'lucide-react'
import { db, updateSettings } from '../lib/db'
import { setActiveCar, useCars, useCatalog, useSettings } from '../lib/store'
import { findModel } from '../lib/maintenance'
import type { Car, Transmission } from '../lib/types'
import { toFa } from '../lib/format'
import { Button, Card, cx, Field, NumberInput, PageHeader, Segmented, Sheet, TextInput, toast } from '../components/ui'

const QUICK_PARTS = ['engine-oil', 'timing-kit', 'air-filter', 'spark-plugs', 'front-pads']

/** Create or edit a car. New cars can seed the last known change of key parts. */
export function CarForm({ car, onDone }: { car?: Car; onDone: (id: number) => void }) {
  const catalog = useCatalog()
  const [modelId, setModelId] = useState(car?.modelId ?? catalog.models[0]?.id)
  const model = findModel(catalog, modelId)
  const [name, setName] = useState(car?.name ?? '')
  const [year, setYear] = useState<number | undefined>(car?.year)
  const [plate, setPlate] = useState(car?.plate ?? '')
  const [transmission, setTransmission] = useState<Transmission>(car?.transmission ?? model?.defaultTransmission ?? 'manual')
  const [km, setKm] = useState<number | undefined>()
  const [quick, setQuick] = useState<Record<string, number | undefined>>({})

  const pickModel = (id: string) => {
    setModelId(id)
    const m = findModel(catalog, id)
    if (m && !m.transmissions.includes(transmission)) setTransmission(m.defaultTransmission)
  }

  async function save() {
    if (!model) return
    const record: Car = { name: name.trim() || model.name, modelId, year, plate: plate || undefined, transmission, createdAt: car?.createdAt ?? Date.now() }
    if (car?.id) {
      await db.cars.update(car.id, record)
      onDone(car.id)
      return
    }
    const id = (await db.cars.add(record)) as number
    const now = Date.now()
    if (km !== undefined) await db.odometer.add({ carId: id, km, date: now })
    const seeded = Object.entries(quick).filter(([, v]) => v !== undefined)
    if (seeded.length) await db.services.bulkAdd(seeded.map(([partId, v]) => ({ carId: id, partId, km: v!, date: now, notes: 'ثبت اولیه (تاریخ تقریبی)' })))
    await setActiveCar(id)
    onDone(id)
  }

  const quickParts = model ? QUICK_PARTS.map((id) => model.parts.find((p) => p.id === id)).filter(Boolean) : []

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-muted">مدل خودرو</p>
      <div className="mb-4 grid gap-2">
        {catalog.models.map((m) => (
          <button key={m.id} onClick={() => pickModel(m.id)} className={cx('flex items-center gap-3 rounded-2xl bg-surface p-4 text-start ring-1 transition', modelId === m.id ? 'ring-2 ring-accent' : 'ring-line')}>
            <span className={cx('grid size-11 place-items-center rounded-xl', modelId === m.id ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>
              <CarFront className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{m.name}</span>
              <span className="block truncate text-xs text-muted">{m.engine}</span>
            </span>
            {modelId === m.id && <Check className="size-5 text-accent" />}
          </button>
        ))}
        <p className="px-1 text-xs text-muted">مدل‌های دیگر به‌زودی اضافه می‌شوند (یا از بخش توسعه‌دهنده اضافه کن).</p>
      </div>
      <Field label="نام دلخواه">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={model?.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="سال ساخت">
          <NumberInput value={year} onChange={setYear} placeholder="۱۳۹۴" />
        </Field>
        <Field label="پلاک">
          <TextInput value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="اختیاری" />
        </Field>
      </div>
      {model && model.transmissions.length > 1 && (
        <Field label="گیربکس">
          <Segmented value={transmission} onChange={setTransmission} options={model.transmissions.map((t) => ({ value: t, label: t === 'auto' ? 'اتوماتیک' : 'دستی' }))} />
        </Field>
      )}
      {!car && (
        <>
          <Field label="کیلومتر فعلی">
            <NumberInput value={km} onChange={setKm} suffix="کیلومتر" />
          </Field>
          <div className="mb-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="font-bold">آخرین تعویض‌ها را یادت هست؟</p>
            <p className="mb-3 text-xs leading-5 text-muted">کیلومتری که آخرین بار عوض شدند (اختیاری — بعداً هم می‌شود ثبت کرد).</p>
            {quickParts.map((p) => (
              <div key={p!.id} className="mb-2 grid grid-cols-[1fr_1.2fr] items-center gap-2">
                <span className="text-sm font-semibold">{p!.name}</span>
                <NumberInput value={quick[p!.id]} onChange={(v) => setQuick((q) => ({ ...q, [p!.id]: v }))} placeholder="کیلومتر" />
              </div>
            ))}
          </div>
        </>
      )}
      <Button className="w-full" onClick={save} disabled={!model}>{car ? 'ذخیره' : 'شروع'}</Button>
    </div>
  )
}

export function CarsScreen() {
  const cars = useCars() ?? []
  const settings = useSettings()
  const catalog = useCatalog()
  const [editing, setEditing] = useState<Car | 'new' | null>(null)
  const activeId = settings.activeCarId ?? cars[0]?.id

  async function remove(car: Car) {
    if (!confirm(`«${car.name}» و تمام سوابقش حذف شود؟ این کار برگشت‌پذیر نیست.`)) return
    await db.transaction('rw', [db.cars, db.odometer, db.services, db.symptoms, db.checks], async () => {
      await db.odometer.where('carId').equals(car.id!).delete()
      await db.services.where('carId').equals(car.id!).delete()
      await db.symptoms.where('carId').equals(car.id!).delete()
      await db.checks.where('carId').equals(car.id!).delete()
      await db.cars.delete(car.id!)
    })
    if (activeId === car.id) await updateSettings({ activeCarId: undefined })
    setEditing(null)
    toast('حذف شد')
  }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="ماشین‌های من" action={<button aria-label="افزودن" onClick={() => setEditing('new')} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg"><Plus className="size-6" /></button>} />
      <div className="space-y-2 px-4">
        {cars.map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-4">
            <button onClick={() => setActiveCar(c.id!)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
              <span className={cx('grid size-11 place-items-center rounded-xl', c.id === activeId ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}><CarFront className="size-6" /></span>
              <span className="min-w-0">
                <span className="block font-bold">{c.name}</span>
                <span className="block truncate text-xs text-muted">{findModel(catalog, c.modelId)?.name}{c.year ? ` • ${toFa(c.year)}` : ''}{c.plate ? ` • ${c.plate}` : ''}</span>
              </span>
            </button>
            <button onClick={() => setEditing(c)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold">ویرایش</button>
          </Card>
        ))}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'ماشین جدید' : 'ویرایش ماشین'}>
        {editing !== null && (
          <>
            <CarForm car={editing === 'new' ? undefined : editing} onDone={() => { setEditing(null); toast('ذخیره شد ✓') }} />
            {editing !== 'new' && (
              <Button variant="danger" className="mt-3 w-full" onClick={() => remove(editing)}><Trash2 className="size-5" />حذف ماشین</Button>
            )}
          </>
        )}
      </Sheet>
    </div>
  )
}

export function CarSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cars = useCars() ?? []
  const settings = useSettings()
  const catalog = useCatalog()
  const activeId = settings.activeCarId ?? cars[0]?.id
  return (
    <Sheet open={open} onClose={onClose} title="انتخاب ماشین">
      <div className="space-y-2 pb-4">
        {cars.map((c) => (
          <button key={c.id} onClick={async () => { await setActiveCar(c.id!); onClose() }} className={cx('flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-start ring-1', c.id === activeId ? 'ring-2 ring-accent' : 'ring-line')}>
            <CarFront className={cx('size-6', c.id === activeId ? 'text-accent' : 'text-muted')} />
            <span className="flex-1">
              <span className="block font-bold">{c.name}</span>
              <span className="block text-xs text-muted">{findModel(catalog, c.modelId)?.name}</span>
            </span>
            {c.id === activeId && <Check className="size-5 text-accent" />}
          </button>
        ))}
        <Button variant="secondary" className="w-full" onClick={() => { onClose(); location.hash = '#/cars' }}><Plus className="size-5" />افزودن / مدیریت ماشین‌ها</Button>
      </div>
    </Sheet>
  )
}
