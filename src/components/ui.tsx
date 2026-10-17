import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { fmtNum, fromJalali, jalali, JALALI_MONTHS, monthLength, parseNumber, toFa } from '../lib/format'
import type { PartState } from '../lib/maintenance'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'block w-full rounded-2xl bg-surface text-start ring-1 ring-line',
        onClick && 'transition active:scale-[0.99] active:bg-surface-2',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'primary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-fg shadow-sm shadow-accent/30',
    secondary: 'bg-surface-2 text-fg',
    ghost: 'bg-transparent text-accent',
    danger: 'bg-danger/10 text-danger',
  }
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition active:scale-[0.98] disabled:opacity-40',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: boolean; action?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 bg-bg/85 px-4 pb-3 backdrop-blur-xl">
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <button aria-label="بازگشت" onClick={() => history.back()} className="-ms-2 grid size-10 place-items-center rounded-full text-accent active:bg-surface-2">
            <ChevronLeft className="size-6 rotate-180" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[15px] font-bold text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[92dvh] flex-col rounded-t-3xl bg-bg shadow-2xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted/30" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button aria-label="بستن" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line bg-bg px-5 pt-3 [&>*]:mb-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full min-h-12 rounded-xl bg-surface px-4 ring-1 ring-line outline-none transition focus:ring-2 focus:ring-accent placeholder:text-muted/60'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputCls, 'py-3', props.className)} />
}

/** Number field that accepts Persian digits and shows thousands separators */
export function NumberInput({ value, onChange, placeholder, suffix, autoFocus, large, decimals }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; suffix?: string; autoFocus?: boolean; large?: boolean; decimals?: boolean }) {
  const [text, setText] = useState(value !== undefined ? (decimals ? toFa(value) : fmtNum(value)) : '')
  useEffect(() => {
    if (parseNumber(text) !== value) setText(value !== undefined ? (decimals ? toFa(value) : fmtNum(value)) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="relative">
      <input
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const n = parseNumber(e.target.value)
          // Decimal fields keep the raw text so "35." can still be typed
          if (decimals) setText(toFa(e.target.value.replace(/[^\d۰-۹٠-٩.٫]/g, '')))
          else setText(n !== undefined ? fmtNum(n) : e.target.value.replace(/[^\d۰-۹٠-٩,٬]/g, ''))
          onChange(n)
        }}
        className={cx(inputCls, 'tnum', large && 'min-h-16 text-center text-3xl font-extrabold tracking-wide', suffix && !large && 'pe-20')}
      />
      {suffix && <span className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted', large ? 'start-4' : 'end-4')}>{suffix}</span>}
    </div>
  )
}

/** Jalali date picker built from three native selects (best UX on iOS) */
export function DateInput({ value, onChange }: { value: number; onChange: (ts: number) => void }) {
  const { jy, jm, jd } = jalali(value)
  const nowY = jalali(Date.now()).jy
  const years = Array.from({ length: 30 }, (_, i) => nowY + 1 - i)
  const set = (y: number, m: number, d: number) => onChange(fromJalali(y, m, Math.min(d, monthLength(y, m)), 12))
  const sel = cx(inputCls, 'appearance-none px-3 text-center')
  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
      <select aria-label="روز" className={sel} value={jd} onChange={(e) => set(jy, jm, +e.target.value)}>
        {Array.from({ length: monthLength(jy, jm) }, (_, i) => (
          <option key={i} value={i + 1}>{toFa(i + 1)}</option>
        ))}
      </select>
      <select aria-label="ماه" className={sel} value={jm} onChange={(e) => set(jy, +e.target.value, jd)}>
        {JALALI_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select aria-label="سال" className={sel} value={jy} onChange={(e) => set(+e.target.value, jm, jd)}>
        {years.map((y) => (
          <option key={y} value={y}>{toFa(y)}</option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('min-h-10 flex-1 rounded-lg text-sm font-semibold transition', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active && color ? { background: color, color: '#fff' } : undefined}
      className={cx('min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition', active ? 'bg-accent text-accent-fg' : 'bg-surface text-fg ring-1 ring-line')}
    >
      {children}
    </button>
  )
}

export const STATE_META: Record<PartState, { label: string; color: string; bg: string }> = {
  overdue: { label: 'عقب افتاده', color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 14%, transparent)' },
  soon: { label: 'نزدیک', color: 'var(--warn)', bg: 'color-mix(in srgb, var(--warn) 16%, transparent)' },
  ok: { label: 'خوب', color: 'var(--ok)', bg: 'color-mix(in srgb, var(--ok) 14%, transparent)' },
  unknown: { label: 'ثبت نشده', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 14%, transparent)' },
  untracked: { label: 'بدون دوره', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 10%, transparent)' },
}

export function StateBadge({ state }: { state: PartState }) {
  const m = STATE_META[state]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: m.color, background: m.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

export function Progress({ value, state }: { value: number; state: PartState }) {
  const pct = Math.max(2, Math.min(100, value * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: STATE_META[state].color }} />
    </div>
  )
}

export function Ring({ value, size = 120, stroke = 10, color, children }: { value: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function ListRow({ icon, title, subtitle, trailing, onClick, danger }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition active:bg-surface-2 disabled:active:bg-transparent">
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate font-semibold', danger && 'text-danger')}>{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing}
      {onClick && <ChevronLeft className="size-5 shrink-0 text-muted/60" />}
    </button>
  )
}

export function IconBox({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: color }}>
      {children}
    </span>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 text-sm leading-6 text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

let toastSetter: ((t: string | null) => void) | null = null

export function toast(msg: string) {
  toastSetter?.(msg)
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastSetter = setMsg
    return () => {
      toastSetter = null
    }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
      <div className="animate-pop rounded-2xl bg-fg px-4 py-3 text-sm font-semibold text-bg shadow-xl">{msg}</div>
    </div>
  )
}
