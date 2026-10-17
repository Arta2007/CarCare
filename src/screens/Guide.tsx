import { useState, type ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import { SOUNDS, WARNING_LIGHTS, type LightColor } from '../data/guide'
import { SYMPTOM_CATEGORIES } from '../data/catalog'
import { openSheet } from '../lib/sheets'
import { Card, cx, PageHeader, Segmented, TextInput } from '../components/ui'

const LIGHT_COLORS: Record<LightColor, { fg: string; label: string }> = {
  red: { fg: '#ef4444', label: 'قرمز: فوراً بایست' },
  yellow: { fg: '#f59e0b', label: 'زرد: به‌زودی بررسی کن' },
  green: { fg: '#22c55e', label: 'سبز/آبی: اطلاع‌رسانی' },
  blue: { fg: '#3b82f6', label: '' },
}

const URGENCY = { 1: { label: 'کم', cls: 'bg-surface-2 text-muted' }, 2: { label: 'به‌زودی', cls: 'bg-warn/15 text-warn' }, 3: { label: 'فوری', cls: 'bg-danger/15 text-danger' } } as const

/** Simplified ISO dashboard symbols */
function LightIcon({ id, color }: { id: string; color: string }) {
  const icons: Record<string, ReactNode> = {
    oil: <><path d="M3 11h4l2-2h5l7 3-6 4H7l-2-2H3z" /><path d="M21 12l1 1" /><path d="M5 9V7h3" /><path d="M21.5 15.5c0 .8-.5 1.5-1 1.5s-1-.7-1-1.5.5-1.5 1-2.5c.5 1 1 1.7 1 2.5z" /></>,
    temp: <><path d="M12 3v11" /><path d="M12 3h3M12 6h3M12 9h3" /><circle cx="12" cy="16.5" r="2.5" /><path d="M3 20c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" /></>,
    battery: <><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M6 7V5h3v2M15 7V5h3v2" /><path d="M6 13h3M7.5 11.5v3M15 13h3" /></>,
    brake: <><circle cx="12" cy="12" r="6" /><path d="M12 9v3.5M12 15h.01" /><path d="M4.5 6.5a9 9 0 000 11M19.5 6.5a9 9 0 010 11" /></>,
    airbag: <><circle cx="7" cy="5" r="1.8" /><path d="M7 8v6l4 4M7 14l-3 5" /><circle cx="15.5" cy="10" r="4.5" /></>,
    seatbelt: <><circle cx="10" cy="4.5" r="1.8" /><path d="M7 21v-8a3 3 0 013-3h0a3 3 0 013 3v8" /><path d="M7 10l7 9" /></>,
    engine: <><path d="M4 9v6M4 12h2M6 8h3l1-2h4v2h3l2 3h2v4h-2l-2 3H9l-3-3V8z" /></>,
    abs: <><circle cx="12" cy="12" r="7" /><path d="M3.5 7a10 10 0 000 10M20.5 7a10 10 0 010 10" /><text x="12" y="14.5" textAnchor="middle" fontSize="6.5" fontWeight="800" stroke="none" fill={color}>ABS</text></>,
    esp: <><path d="M6 13l1.5-4h9L18 13v4H6z" /><circle cx="8.5" cy="17" r="1" /><circle cx="15.5" cy="17" r="1" /><path d="M7 20c1-1 2 1 3 0M14 20c1-1 2 1 3 0" /></>,
    eps: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M5 12h5M14 12h5M12 14v5" /><path d="M20 4l1.5 1.5" /></>,
    tpms: <><path d="M6 6a8 8 0 1012 0" /><path d="M5 18h14" /><path d="M12 8v4.5M12 15h.01" /></>,
    fuel: <><path d="M5 20V5a1 1 0 011-1h7a1 1 0 011 1v15M4 20h11M6.5 7h6v4h-6z" /><path d="M14 9h2l2 2v6a1 1 0 002 0V8l-2-2" /></>,
    immo: <><path d="M5 17l6-6M8 14l2 2M6.5 15.5l1.5 1.5" /><circle cx="15" cy="9" r="4" /><path d="M14 9h2" /></>,
    washer: <><path d="M4 16c4-8 12-8 16 0" /><path d="M12 16V9" /><path d="M8 5l1 2M12 4v2M16 5l-1 2" /></>,
    highbeam: <><path d="M12 6c-3 0-5 2.7-5 6s2 6 5 6c1 0 1.5-2.7 1.5-6S13 6 12 6z" /><path d="M16 8h5M16 11h5M16 14h5M16 17h5" /></>,
    lights: <><path d="M10 6c-3 0-5 2.7-5 6s2 6 5 6c1 0 1.5-2.7 1.5-6S11 6 10 6z" /><path d="M14 8l5 1M14 11.5l5 1M14 15l5 1" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {icons[id]}
    </svg>
  )
}

export function GuideScreen() {
  const [tab, setTab] = useState<'lights' | 'sounds'>('lights')
  const [q, setQ] = useState('')
  const lights = WARNING_LIGHTS.filter((l) => !q || l.name.includes(q) || l.meaning.includes(q))
  const sounds = SOUNDS.filter((s) => !q || s.title.includes(q) || s.cause.includes(q))

  return (
    <div className="pb-tabbar">
      <PageHeader back title="راهنمای عیب‌یابی" subtitle="چراغ‌های داشبورد، صداها، بوها و دود" />
      <div className="px-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'lights', label: 'چراغ‌های داشبورد' }, { value: 'sounds', label: 'صدا، بو و دود' }]} />
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو…" className="ps-10" />
        </div>

        {tab === 'lights' ? (
          <>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {(['red', 'yellow', 'green'] as const).map((c) => (
                <span key={c} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: LIGHT_COLORS[c].fg }} />{LIGHT_COLORS[c].label}</span>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {lights.map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#0b0f17]">
                      <LightIcon id={l.id} color={LIGHT_COLORS[l.color].fg} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{l.name}</p>
                      <p className="mt-1 text-sm leading-6 text-muted">{l.meaning}</p>
                    </div>
                  </div>
                  <p className={cx('mt-3 rounded-xl p-3 text-sm leading-6', l.color === 'red' ? 'bg-danger/10 font-semibold text-danger' : 'bg-surface-2')}>{l.action}</p>
                  {l.color !== 'green' && l.color !== 'blue' && (
                    <button onClick={() => openSheet({ type: 'symptom', preset: { title: `چراغ ${l.name} روشن شد`, category: 'warning', severity: l.severity } })} className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent">
                      <Plus className="size-4" />برای ماشین من روشن شده — ثبت کن
                    </button>
                  )}
                </Card>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-2">
            {sounds.map((s) => (
              <Card key={s.title} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{s.title}</p>
                  <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', URGENCY[s.urgency].cls)}>{URGENCY[s.urgency].label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{SYMPTOM_CATEGORIES[s.category]}</p>
                <p className="mt-2 text-sm leading-6">{s.cause}</p>
                <button onClick={() => openSheet({ type: 'symptom', preset: { title: s.title, category: s.category, severity: s.urgency } })} className="mt-2 flex items-center gap-1 text-sm font-semibold text-accent">
                  <Plus className="size-4" />ماشین من هم این را دارد — ثبت کن
                </button>
              </Card>
            ))}
          </div>
        )}
        <p className="mt-4 px-1 text-xs leading-5 text-muted">این راهنما عمومی است و جای تشخیص تعمیرکار را نمی‌گیرد. شکل چراغ‌ها ممکن است کمی با داشبورد ماشین شما فرق کند.</p>
      </div>
    </div>
  )
}
