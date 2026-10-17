import { useState } from 'react'
import { BellRing, BookOpen, CheckCircle2, Pencil, Plus, RotateCcw, Siren, Trash2 } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { db } from '../lib/db'
import { relatedStatuses } from '../lib/insights'
import { DueRow } from './Home'
import { deletePhotos, PhotoStrip } from '../components/photos'
import { openSheet } from '../lib/sheets'
import { navigate } from '../lib/router'
import { SYMPTOM_CATEGORIES } from '../data/catalog'
import { DAY, fmtDate, fmtKm, fmtRelDays, toFa } from '../lib/format'
import type { Symptom } from '../lib/types'
import { Button, Card, cx, Empty, Field, PageHeader, Segmented, TextArea, toast } from '../components/ui'

const SEVERITY = { 1: { label: 'جزئی', cls: 'text-muted bg-surface-2' }, 2: { label: 'متوسط', cls: 'text-warn bg-warn/15' }, 3: { label: 'جدی', cls: 'text-danger bg-danger/15' } } as const

export function SymptomsScreen({ data }: { data: ActiveCar }) {
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const list = data.symptoms.filter((s) => s.status === tab).sort((a, b) => (tab === 'open' ? b.severity - a.severity || b.date - a.date : (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)))

  return (
    <div className="pb-tabbar">
      <PageHeader
        title="علائم و خرابی‌ها"
        subtitle="صداها، لرزش‌ها و هر چیز غیرعادی"
        action={
          <button aria-label="ثبت علامت" onClick={() => openSheet({ type: 'symptom' })} className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="px-4">
        <Card onClick={() => navigate('guide')} className="mb-3 flex items-center gap-3 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/15 text-danger"><BookOpen className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">راهنمای عیب‌یابی</span>
            <span className="block text-xs text-muted">معنی چراغ‌های داشبورد، صداها، بوها و دود</span>
          </span>
        </Card>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'open', label: `باز (${toFa(data.symptoms.filter((s) => s.status === 'open').length)})` }, { value: 'resolved', label: 'برطرف‌شده' }]} />
        {!list.length ? (
          <Empty
            icon={<Siren className="size-8" />}
            title={tab === 'open' ? 'مشکل بازی نداری' : 'هنوز چیزی برطرف نشده'}
            text={tab === 'open' ? 'هر صدا یا رفتار عجیبی دیدی همین‌جا ثبت کن تا یادت نرود و به تعمیرکار نشان بدهی.' : undefined}
            action={tab === 'open' && <Button onClick={() => openSheet({ type: 'symptom' })}><Plus className="size-5" />ثبت علامت جدید</Button>}
          />
        ) : (
          <div className="mt-4 space-y-2">
            {list.map((s) => (
              <SymptomCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SymptomCard({ s }: { s: Symptom }) {
  const sev = SEVERITY[s.severity]
  return (
    <Card onClick={() => navigate(`symptom/${s.id}`)} className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-muted">{SYMPTOM_CATEGORIES[s.category]}</span>
            <span className={cx('rounded-full px-2 py-0.5 font-bold', sev.cls)}>{sev.label}</span>
          </div>
          <p className="mt-2 font-bold">{s.title}</p>
          {s.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>}
          <p className="mt-2 text-xs text-muted">
            {fmtRelDays(s.date)}
            {s.km ? ` • ${fmtKm(s.km)}` : ''}
            {s.status === 'open' && s.remindAt ? ` • یادآوری ${fmtRelDays(s.remindAt)}` : ''}
          </p>
        </div>
      </div>
    </Card>
  )
}

export function SymptomDetail({ data, id }: { data: ActiveCar; id: number }) {
  const s = data.symptoms.find((x) => x.id === id)
  const [resolution, setResolution] = useState('')
  const [snooze, setSnooze] = useState<number>(3)
  if (!s) return <Empty icon={<Siren />} title="پیدا نشد" />
  const sev = SEVERITY[s.severity]

  async function resolve() {
    await db.symptoms.update(id, { status: 'resolved', resolvedAt: Date.now(), resolution: resolution || undefined })
    toast('برطرف شد ✓')
    history.back()
  }
  async function reopen() {
    await db.symptoms.update(id, { status: 'open', resolvedAt: undefined, remindAt: Date.now() + 3 * DAY })
    toast('دوباره باز شد')
  }
  async function remind() {
    await db.symptoms.update(id, { remindAt: Date.now() + snooze * DAY })
    toast(`${toFa(snooze)} روز دیگر یادآوری می‌کنم`)
  }
  async function remove() {
    if (!confirm('این مورد حذف شود؟')) return
    await db.symptoms.delete(id)
    await deletePhotos('symptom', id)
    history.back()
  }

  return (
    <div className="pb-tabbar">
      <PageHeader
        back
        title={s.title}
        subtitle={SYMPTOM_CATEGORIES[s.category]}
        action={
          <button aria-label="ویرایش" onClick={() => openSheet({ type: 'symptom', editId: id })} className="grid size-10 place-items-center rounded-full bg-surface-2 text-accent">
            <Pencil className="size-5" />
          </button>
        }
      />
      <div className="space-y-3 px-4">
        <Card className="p-4">
          <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', sev.cls)}>{sev.label}</span>
          {s.description && <p className="mt-3 whitespace-pre-wrap leading-7">{s.description}</p>}
          <div className="mt-3"><PhotoStrip owner="symptom" ownerId={id} /></div>
          <p className="mt-3 text-sm text-muted">
            مشاهده: {fmtDate(s.date)}
            {s.km ? ` • ${fmtKm(s.km)}` : ''}
          </p>
          {s.status === 'resolved' && s.resolvedAt && (
            <p className="mt-1 text-sm font-semibold text-ok">برطرف شد: {fmtDate(s.resolvedAt)}{s.resolution ? ` — ${s.resolution}` : ''}</p>
          )}
        </Card>

        {s.status === 'open' && <RelatedParts data={data} symptom={s} />}

        {s.status === 'open' ? (
          <>
            <Card className="p-4">
              <p className="mb-1 flex items-center gap-2 font-bold"><BellRing className="size-5 text-accent" />یادآوری بعدی</p>
              <p className="mb-3 text-sm text-muted">{s.remindAt ? `${fmtDate(s.remindAt)} (${fmtRelDays(s.remindAt)})` : 'تنظیم نشده'}</p>
              <Segmented value={snooze} onChange={setSnooze} options={[{ value: 1, label: 'فردا' }, { value: 3, label: '۳ روز' }, { value: 7, label: 'یک هفته' }, { value: 30, label: 'یک ماه' }]} />
              <Button variant="secondary" className="mt-3 w-full" onClick={remind}>تنظیم یادآوری</Button>
            </Card>
            <Card className="p-4">
              <Field label="چطور برطرف شد؟ (اختیاری)">
                <TextArea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="مثلاً لنت جلو عوض شد" />
              </Field>
              <Button className="w-full !bg-ok" onClick={resolve}><CheckCircle2 className="size-5" />برطرف شد</Button>
              <p className="mt-2 text-center text-xs text-muted">اگر قطعه‌ای عوض شد، آن را هم از «ثبت تعویض» ثبت کن.</p>
            </Card>
          </>
        ) : (
          <Button variant="secondary" className="w-full" onClick={reopen}><RotateCcw className="size-5" />مشکل برگشته — دوباره باز کن</Button>
        )}
        <Button variant="danger" className="w-full" onClick={remove}><Trash2 className="size-5" />حذف</Button>
      </div>
    </div>
  )
}

/** Parts that commonly cause this kind of symptom, with how worn they are */
function RelatedParts({ data, symptom }: { data: ActiveCar; symptom: Symptom }) {
  const related = relatedStatuses(symptom, data).slice(0, 5)
  if (!related.length) return null
  return (
    <div>
      <p className="mb-2 mt-1 px-1 text-sm font-bold text-muted">قطعات مرتبط — شاید علتش این‌ها باشد</p>
      <Card className="divide-y divide-line overflow-hidden">
        {related.map((r) => <DueRow key={r.part.id} s={r} />)}
      </Card>
    </div>
  )
}
