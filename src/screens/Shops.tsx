import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MapPin, Phone, Plus, Star, Store, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { fmtDate, fmtToman, toFa } from '../lib/format'
import type { Shop } from '../lib/types'
import { Button, Card, cx, Empty, Field, PageHeader, Sheet, TextArea, TextInput, toast } from '../components/ui'

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i === value ? 0 : i)} aria-label={`${i} ستاره`}>
          <Star className={cx(onChange ? 'size-7' : 'size-4', i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted/40')} />
        </button>
      ))}
    </span>
  )
}

export function ShopsScreen() {
  const shops = useLiveQuery(() => db.shops.toArray(), [], [] as Shop[])
  const services = useLiveQuery(() => db.services.toArray(), [], [])
  const [editing, setEditing] = useState<Partial<Shop> | null>(null)

  // Shops the user typed in service records but never saved here
  const known = new Set(shops.map((s) => s.name))
  const unsaved = [...new Set(services.map((s) => s.shop).filter((n): n is string => !!n && !known.has(n)))]

  return (
    <div className="pb-tabbar">
      <PageHeader back title="تعمیرگاه‌ها" subtitle="تعمیرکارها و فروشگاه‌های مورد اعتماد" action={<button aria-label="افزودن" onClick={() => setEditing({})} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg"><Plus className="size-6" /></button>} />
      <div className="space-y-2 px-4">
        {!shops.length && !unsaved.length && (
          <Empty icon={<Store className="size-8" />} title="تعمیرگاهی ثبت نشده" text="شماره و تخصص تعمیرکارهای خوبت را نگه دار؛ سابقه‌ی کارهایشان هم کنارشان می‌آید." action={<Button onClick={() => setEditing({})}><Plus className="size-5" />افزودن تعمیرگاه</Button>} />
        )}
        {[...shops].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).map((s) => {
          const jobs = services.filter((r) => r.shop === s.name)
          const spent = jobs.reduce((a, r) => a + (r.cost ?? 0), 0)
          const last = jobs.reduce((a, r) => Math.max(a, r.date), 0)
          return (
            <Card key={s.id} className="p-4">
              <button className="w-full text-start" onClick={() => setEditing(s)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{s.name}</p>
                    {s.specialty && <p className="text-sm text-muted">{s.specialty}</p>}
                  </div>
                  {s.rating ? <Stars value={s.rating} /> : null}
                </div>
                {s.address && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin className="size-3.5" />{s.address}</p>}
                <p className="mt-2 text-xs text-muted">
                  {jobs.length ? `${toFa(jobs.length)} کار${spent ? ` • ${fmtToman(spent)}` : ''} • آخرین: ${fmtDate(last)}` : 'هنوز کاری ثبت نشده'}
                </p>
              </button>
              {s.phone && (
                <a href={`tel:${s.phone.replace(/[^\d+۰-۹]/g, '')}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ok/15 font-bold text-ok">
                  <Phone className="size-5" />تماس {s.phone}
                </a>
              )}
            </Card>
          )
        })}
        {unsaved.length > 0 && (
          <>
            <p className="px-1 pt-4 text-sm font-bold text-muted">از سوابق تعویض‌ها</p>
            {unsaved.map((n) => (
              <Card key={n} onClick={() => setEditing({ name: n })} className="flex items-center justify-between p-4">
                <span className="font-semibold">{n}</span>
                <span className="text-sm font-semibold text-accent">+ ذخیره</span>
              </Card>
            ))}
          </>
        )}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'ویرایش تعمیرگاه' : 'تعمیرگاه جدید'}>
        {editing && <ShopForm initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  )
}

function ShopForm({ initial, onDone }: { initial: Partial<Shop>; onDone: () => void }) {
  const [s, setS] = useState<Partial<Shop>>(initial)
  const set = (patch: Partial<Shop>) => setS((x) => ({ ...x, ...patch }))

  async function save() {
    if (!s.name?.trim()) return
    const rec: Shop = { name: s.name.trim(), phone: s.phone || undefined, specialty: s.specialty || undefined, address: s.address || undefined, notes: s.notes || undefined, rating: s.rating || undefined }
    if (initial.id) {
      await db.shops.update(initial.id, rec)
      // Keep service records pointing at the renamed shop
      if (initial.name && initial.name !== rec.name) await db.services.filter((r) => r.shop === initial.name).modify({ shop: rec.name })
    } else await db.shops.add(rec)
    toast('ذخیره شد ✓')
    onDone()
  }

  async function remove() {
    if (!initial.id || !confirm('حذف شود؟ سوابق تعویض‌ها باقی می‌ماند.')) return
    await db.shops.delete(initial.id)
    onDone()
  }

  return (
    <div className="pb-4">
      <Field label="نام"><TextInput value={s.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً تعمیرگاه رضا" /></Field>
      <Field label="تلفن"><TextInput dir="ltr" inputMode="tel" value={s.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="0912…" /></Field>
      <Field label="تخصص"><TextInput value={s.specialty ?? ''} onChange={(e) => set({ specialty: e.target.value })} placeholder="مکانیک، برق، جلوبندی، گیربکس اتومات، لوازم یدکی…" /></Field>
      <Field label="آدرس"><TextInput value={s.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label="امتیاز"><Stars value={s.rating ?? 0} onChange={(v) => set({ rating: v })} /></Field>
      <Field label="یادداشت"><TextArea value={s.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="مثلاً با هماهنگی قبلی، ساعت کاری" /></Field>
      <div className="flex gap-2">
        {initial.id && <Button variant="danger" onClick={remove} aria-label="حذف"><Trash2 className="size-5" /></Button>}
        <Button className="flex-1" disabled={!s.name?.trim()} onClick={save}>ذخیره</Button>
      </div>
    </div>
  )
}
