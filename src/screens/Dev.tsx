import { useEffect, useState } from 'react'
import { Copy, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import { resetCatalog, saveCatalog, updateSettings } from '../lib/db'
import { useCatalog, useSettings } from '../lib/store'
import { pickFile, saveFile } from '../lib/files'
import { CATEGORIES } from '../data/catalog'
import { fmtKm, fmtToman, toFa } from '../lib/format'
import type { CarModel, Catalog, CategoryId, PartSpec, Transmission } from '../lib/types'
import { Button, Card, Chip, cx, Field, NumberInput, PageHeader, SectionTitle, Segmented, Sheet, TextArea, TextInput, toast } from '../components/ui'

/**
 * Developer panel: edit the maintenance catalog (intervals, prices, notes,
 * models) and the reminder tuning knobs. Unlocked by tapping the version
 * label seven times.
 */
export function DevScreen() {
  const stored = useCatalog()
  const settings = useSettings()
  const [catalog, setCatalog] = useState<Catalog>(stored)
  const [modelId, setModelId] = useState<string | undefined>(stored.models[0]?.id)
  const [editing, setEditing] = useState<PartSpec | 'new' | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setCatalog(stored)
  }, [stored, dirty])

  const model = catalog.models.find((m) => m.id === modelId) ?? catalog.models[0]
  const mutateModel = (fn: (m: CarModel) => CarModel) => {
    setCatalog((c) => ({ ...c, models: c.models.map((m) => (m.id === model.id ? fn(m) : m)) }))
    setDirty(true)
  }

  async function save() {
    await saveCatalog(catalog)
    setDirty(false)
    toast('کاتالوگ ذخیره شد ✓')
  }

  async function reset() {
    if (!confirm('همه‌ی تغییرات کاتالوگ پاک شود و مقادیر پیش‌فرض برگردد؟')) return
    await resetCatalog()
    setDirty(false)
    toast('به پیش‌فرض برگشت')
  }

  function cloneModel() {
    const name = prompt('نام مدل جدید (مثلاً پژو ۲۰۶ تیپ ۵):')
    if (!name) return
    const id = `custom-${Date.now().toString(36)}`
    setCatalog((c) => ({ ...c, models: [...c.models, { ...structuredClone(model), id, name }] }))
    setModelId(id)
    setDirty(true)
  }

  function deleteModel() {
    if (catalog.models.length <= 1 || !confirm(`مدل «${model.name}» حذف شود؟ ماشین‌هایی که این مدل را دارند کار نخواهند کرد.`)) return
    setCatalog((c) => ({ ...c, models: c.models.filter((m) => m.id !== model.id) }))
    setModelId(catalog.models.find((m) => m.id !== model.id)?.id)
    setDirty(true)
  }

  function upsertPart(p: PartSpec) {
    mutateModel((m) => ({ ...m, parts: m.parts.some((x) => x.id === p.id) ? m.parts.map((x) => (x.id === p.id ? p : x)) : [...m.parts, p] }))
    setEditing(null)
  }

  function deletePart(id: string) {
    if (!confirm('این قطعه حذف شود؟ سوابق ثبت‌شده‌ی آن باقی می‌ماند.')) return
    mutateModel((m) => ({ ...m, parts: m.parts.filter((x) => x.id !== id) }))
    setEditing(null)
  }

  async function importCatalog() {
    const text = await pickFile('application/json,.json')
    if (!text) return
    try {
      const c = JSON.parse(text) as Catalog
      if (!Array.isArray(c.models)) throw new Error()
      setCatalog(c)
      setDirty(true)
      toast('وارد شد — ذخیره را بزن')
    } catch {
      toast('فایل کاتالوگ معتبر نیست')
    }
  }

  return (
    <div className="pb-tabbar">
      <PageHeader back title="توسعه‌دهنده" subtitle="کاتالوگ قطعات و تنظیمات پیشرفته" />
      <div className="px-4">
        {dirty && (
          <div className="sticky top-24 z-10 mb-3 flex gap-2 rounded-2xl bg-accent p-2 shadow-lg">
            <Button className="flex-1 !bg-white !text-accent" onClick={save}>ذخیره‌ی تغییرات</Button>
            <Button variant="ghost" className="!text-white" onClick={() => { setDirty(false); setCatalog(stored) }}>لغو</Button>
          </div>
        )}

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {catalog.models.map((m) => <Chip key={m.id} active={m.id === model.id} onClick={() => setModelId(m.id)}>{m.name}</Chip>)}
        </div>

        <Card className="mt-3 p-4">
          <Field label="نام مدل"><TextInput value={model.name} onChange={(e) => mutateModel((m) => ({ ...m, name: e.target.value }))} /></Field>
          <Field label="موتور"><TextInput value={model.engine} onChange={(e) => mutateModel((m) => ({ ...m, engine: e.target.value }))} /></Field>
          <Field label="گیربکس‌های موجود">
            <div className="flex gap-2">
              {(['manual', 'auto'] as Transmission[]).map((t) => {
                const on = model.transmissions.includes(t)
                return <Chip key={t} active={on} onClick={() => mutateModel((m) => {
                  const ts = on ? m.transmissions.filter((x) => x !== t) : [...m.transmissions, t]
                  return ts.length ? { ...m, transmissions: ts, defaultTransmission: ts.includes(m.defaultTransmission) ? m.defaultTransmission : ts[0] } : m
                })}>{t === 'auto' ? 'اتوماتیک' : 'دستی'}</Chip>
              })}
            </div>
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={cloneModel}><Copy className="size-4" />کپی به مدل جدید</Button>
            <Button variant="danger" onClick={deleteModel} aria-label="حذف مدل"><Trash2 className="size-4" /></Button>
          </div>
        </Card>

        <SectionTitle action={<button className="flex items-center gap-1 text-sm font-semibold text-accent" onClick={() => setEditing('new')}><Plus className="size-4" />قطعه</button>}>
          قطعات ({toFa(model.parts.length)})
        </SectionTitle>
        <Card className="divide-y divide-line overflow-hidden">
          {model.parts.map((p) => (
            <button key={p.id} onClick={() => setEditing(p)} className={cx('flex w-full items-center gap-3 px-4 py-3 text-start active:bg-surface-2', p.enabled === false && 'opacity-40')}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORIES[p.category].color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}{p.transmission ? ` (${p.transmission === 'auto' ? 'اتو' : 'دستی'})` : ''}</span>
                <span className="block truncate text-xs text-muted">
                  {[p.intervalKm && fmtKm(p.intervalKm), p.intervalMonths && `${toFa(p.intervalMonths)} ماه`, p.price && fmtToman(p.price)].filter(Boolean).join(' • ') || 'بدون دوره'}
                </span>
              </span>
            </button>
          ))}
        </Card>

        <SectionTitle>تنظیمات پیشرفته‌ی یادآور</SectionTitle>
        <Card className="grid grid-cols-2 gap-x-3 p-4">
          <Field label="«نزدیک» تا (کیلومتر)"><NumberInput value={settings.soonKm} onChange={(v) => v !== undefined && updateSettings({ soonKm: v })} /></Field>
          <Field label="«نزدیک» تا (روز)"><NumberInput value={settings.soonDays} onChange={(v) => v !== undefined && updateSettings({ soonDays: v })} /></Field>
          <Field label="کیلومتر روزانه‌ی پیش‌فرض"><NumberInput value={settings.defaultDailyKm} onChange={(v) => v && updateSettings({ defaultDailyKm: v })} /></Field>
          <Field label="پیگیری علامت (روز)"><NumberInput value={settings.symptomFollowupDays} onChange={(v) => v && updateSettings({ symptomFollowupDays: v })} /></Field>
          <Field label="کیلومتر — عادی (روز)"><NumberInput value={settings.odometerPromptDays} onChange={(v) => v && updateSettings({ odometerPromptDays: v })} /></Field>
          <Field label="کیلومتر — نزدیک موعد (روز)"><NumberInput value={settings.odometerPromptDaysUrgent} onChange={(v) => v && updateSettings({ odometerPromptDaysUrgent: v })} /></Field>
        </Card>

        <SectionTitle>کاتالوگ</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => saveFile('carcare-catalog.json', JSON.stringify(catalog, null, 2), 'application/json')}><Download className="size-4" />خروجی</Button>
          <Button variant="secondary" onClick={importCatalog}><Upload className="size-4" />ورودی</Button>
          <Button variant="danger" className="col-span-2" onClick={reset}><RotateCcw className="size-4" />بازگشت به پیش‌فرض</Button>
        </div>
        <p className="mt-3 px-1 text-xs leading-5 text-muted">قیمت‌ها تخمین {catalog.priceDate} هستند. شناسه‌ی هر قطعه (id) برای اتصال به سوابق استفاده می‌شود؛ آن را برای قطعات موجود تغییر نده.</p>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'قطعه‌ی جدید' : 'ویرایش قطعه'}>
        {editing !== null && <PartEditor part={editing === 'new' ? undefined : editing} onSave={upsertPart} onDelete={deletePart} />}
      </Sheet>
    </div>
  )
}

function PartEditor({ part, onSave, onDelete }: { part?: PartSpec; onSave: (p: PartSpec) => void; onDelete: (id: string) => void }) {
  const [p, setP] = useState<PartSpec>(part ?? { id: `part-${Date.now().toString(36)}`, name: '', category: 'engine', enabled: true })
  const set = (patch: Partial<PartSpec>) => setP((x) => ({ ...x, ...patch }))
  return (
    <div className="pb-4">
      <Field label="نام"><TextInput value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="دسته">
        <select className="min-h-12 w-full rounded-xl bg-surface px-4 ring-1 ring-line" value={p.category} onChange={(e) => set({ category: e.target.value as CategoryId })}>
          {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="هر چند کیلومتر"><NumberInput value={p.intervalKm} onChange={(v) => set({ intervalKm: v || undefined })} /></Field>
        <Field label="هر چند ماه"><NumberInput value={p.intervalMonths} onChange={(v) => set({ intervalMonths: v || undefined })} /></Field>
      </div>
      <Field label="قیمت تقریبی (تومان)"><NumberInput value={p.price} onChange={(v) => set({ price: v || undefined })} /></Field>
      <Field label="فقط برای گیربکس">
        <Segmented value={p.transmission ?? 'any'} onChange={(v) => set({ transmission: v === 'any' ? undefined : (v as Transmission) })} options={[{ value: 'any', label: 'همه' }, { value: 'manual', label: 'دستی' }, { value: 'auto', label: 'اتوماتیک' }]} />
      </Field>
      <Field label="توضیح"><TextArea value={p.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} /></Field>
      <div className="mb-4 flex gap-2">
        <Chip active={p.critical} onClick={() => set({ critical: !p.critical })}>حیاتی</Chip>
        <Chip active={p.enabled !== false} onClick={() => set({ enabled: p.enabled === false })}>فعال</Chip>
      </div>
      <p className="mb-3 text-xs text-muted" dir="ltr">id: {p.id}</p>
      <div className="flex gap-2">
        {part && <Button variant="danger" onClick={() => onDelete(p.id)} aria-label="حذف"><Trash2 className="size-5" /></Button>}
        <Button className="flex-1" disabled={!p.name.trim()} onClick={() => onSave(p)}>تأیید</Button>
      </div>
    </div>
  )
}
