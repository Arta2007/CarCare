import { useEffect, useState } from 'react'
import { FileBadge, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { db } from '../lib/db'
import { addMonths, fmtDate, fmtToman } from '../lib/format'
import { currentDocuments, DOC_TYPES, docName, docUrgency } from '../lib/documents'
import type { CarDocument, DocType } from '../lib/types'
import { deletePhotos, loadPhotos, PhotoPicker, PhotoStrip, savePhotos, type PhotoItem } from '../components/photos'
import { Button, Card, Chip, cx, DateInput, Empty, Field, NumberInput, PageHeader, SectionTitle, Sheet, TextArea, TextInput, toast } from '../components/ui'

export function DocumentsScreen({ data }: { data: ActiveCar }) {
  const [editing, setEditing] = useState<Partial<CarDocument> | null>(null)
  const current = currentDocuments(data.documents)
  const currentIds = new Set(current.map((d) => d.id))
  const past = data.documents.filter((d) => !currentIds.has(d.id)).sort((a, b) => b.expiresAt - a.expiresAt)

  const renew = (d: CarDocument) =>
    setEditing({ type: d.type, title: d.title, company: d.company, issuedAt: d.expiresAt, expiresAt: addMonths(Math.max(d.expiresAt, Date.now()), DOC_TYPES[d.type].months) })

  return (
    <div className="pb-tabbar">
      <PageHeader
        back
        title="مدارک و بیمه"
        subtitle={data.car.name}
        action={<button aria-label="افزودن" onClick={() => setEditing({})} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg"><Plus className="size-6" /></button>}
      />
      <div className="px-4">
        {!current.length ? (
          <Empty
            icon={<ShieldCheck className="size-8" />}
            title="مدرکی ثبت نشده"
            text="تاریخ انقضای بیمه شخص ثالث، معاینه فنی و… را ثبت کن تا ۳۰ روز، ۷ روز و ۱ روز قبل یادآوری کنم."
            action={<Button onClick={() => setEditing({ type: 'insurance' })}><Plus className="size-5" />ثبت بیمه شخص ثالث</Button>}
          />
        ) : (
          <div className="space-y-2">
            {current.map((d) => {
              const u = docUrgency(d)
              return (
                <Card key={d.id} className="p-4">
                  <button className="flex w-full items-start gap-3 text-start" onClick={() => setEditing(d)}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: DOC_TYPES[d.type].color }}><FileBadge className="size-6" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{docName(d)}</span>
                      <span className="block text-sm font-semibold" style={{ color: u.color }}>{u.label}</span>
                      <span className="block text-xs text-muted">
                        انقضا: {fmtDate(d.expiresAt)}
                        {d.company && ` • ${d.company}`}
                        {d.cost ? ` • ${fmtToman(d.cost)}` : ''}
                      </span>
                    </span>
                  </button>
                  <div className="mt-2"><PhotoStrip owner="document" ownerId={d.id!} /></div>
                  <Button variant="secondary" className="mt-3 min-h-10 w-full text-sm" onClick={() => renew(d)}><RefreshCw className="size-4" />تمدید کردم</Button>
                </Card>
              )
            })}
          </div>
        )}
        {past.length > 0 && (
          <>
            <SectionTitle>سابقه</SectionTitle>
            <Card className="divide-y divide-line overflow-hidden">
              {past.map((d) => (
                <button key={d.id} onClick={() => setEditing(d)} className="block w-full px-4 py-3 text-start active:bg-surface-2">
                  <span className="block font-semibold">{docName(d)}</span>
                  <span className="block text-xs text-muted">{d.issuedAt ? `${fmtDate(d.issuedAt)} تا ` : 'تا '}{fmtDate(d.expiresAt)}{d.cost ? ` • ${fmtToman(d.cost)}` : ''}</span>
                </button>
              ))}
            </Card>
          </>
        )}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'ویرایش مدرک' : 'مدرک جدید'}>
        {editing && <DocumentForm data={data} initial={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  )
}

function DocumentForm({ data, initial, onDone }: { data: ActiveCar; initial: Partial<CarDocument>; onDone: () => void }) {
  const [type, setType] = useState<DocType>(initial.type ?? 'insurance')
  const [title, setTitle] = useState(initial.title ?? '')
  const [company, setCompany] = useState(initial.company ?? '')
  const [issuedAt, setIssuedAt] = useState(initial.issuedAt ?? Date.now())
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt ?? addMonths(Date.now(), DOC_TYPES[initial.type ?? 'insurance'].months))
  const [cost, setCost] = useState<number | undefined>(initial.cost)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  useEffect(() => {
    if (initial.id) loadPhotos('document', initial.id).then(setPhotos)
  }, [initial.id])

  async function save() {
    const rec: CarDocument = { carId: data.car.id!, type, title: title || undefined, company: company || undefined, issuedAt, expiresAt, cost, notes: notes || undefined }
    let id = initial.id
    if (id) await db.documents.update(id, rec)
    else id = (await db.documents.add(rec)) as number
    await savePhotos('document', id, photos)
    toast(`ذخیره شد — قبل از ${fmtDate(expiresAt)} یادآوری می‌کنم`)
    onDone()
  }

  async function remove() {
    if (!initial.id || !confirm('حذف شود؟')) return
    await db.documents.delete(initial.id)
    await deletePhotos('document', initial.id)
    onDone()
  }

  return (
    <div className="pb-4">
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(DOC_TYPES) as DocType[]).map((t) => (
          <Chip key={t} active={type === t} onClick={() => { setType(t); if (!initial.expiresAt) setExpiresAt(addMonths(issuedAt, DOC_TYPES[t].months)) }}>{DOC_TYPES[t].name}</Chip>
        ))}
      </div>
      {type === 'other' && <Field label="عنوان"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً طرح ترافیک" /></Field>}
      <Field label={type === 'inspection' ? 'مرکز معاینه' : 'شرکت / صادرکننده'}><TextInput value={company} onChange={(e) => setCompany(e.target.value)} placeholder="اختیاری" /></Field>
      <Field label="تاریخ شروع / صدور"><DateInput value={issuedAt} onChange={(v) => { setIssuedAt(v); if (!initial.expiresAt) setExpiresAt(addMonths(v, DOC_TYPES[type].months)) }} /></Field>
      <Field label="تاریخ انقضا"><DateInput value={expiresAt} onChange={setExpiresAt} /></Field>
      <Field label="هزینه (تومان)"><NumberInput value={cost} onChange={setCost} /></Field>
      <Field label="یادداشت"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="شماره بیمه‌نامه، تخفیف عدم خسارت، …" /></Field>
      <PhotoPicker value={photos} onChange={setPhotos} label="عکس بیمه‌نامه / برگه معاینه" />
      <div className="flex gap-2">
        {initial.id && <Button variant="danger" onClick={remove} aria-label="حذف"><Trash2 className="size-5" /></Button>}
        <Button className={cx('flex-1')} onClick={save} disabled={type === 'other' && !title.trim()}>ذخیره</Button>
      </div>
    </div>
  )
}
