import type { ActiveCar } from './store'
import { allStatuses, latestKm } from './maintenance'
import { currentDocuments, docName } from './documents'
import { CATEGORIES } from '../data/catalog'
import { fmtDateShort, fmtKm, fmtNum, fmtToman, toFa } from './format'
import { imagesToPdf, type PdfPage } from './pdf'

export interface ReportOptions {
  costs: boolean
  plate: boolean
  symptoms: boolean
}

// A4 at 150 dpi
const W = 1240
const H = 1754
const M = 80
const FONT = '"Vazirmatn Variable", Vazirmatn, system-ui, sans-serif'
const C = { fg: '#0f172a', muted: '#64748b', line: '#e2e8f0', accent: '#2f6bff', soft: '#f1f5f9', ok: '#17b26a', warn: '#d97706', danger: '#dc2626' }

interface Col {
  /** Share of the content width */
  w: number
  align?: 'right' | 'left' | 'center'
}

/** Lays out RTL text onto a series of A4 canvases */
class Painter {
  pages: HTMLCanvasElement[] = []
  ctx!: CanvasRenderingContext2D
  y = 0

  constructor() {
    this.newPage()
  }

  newPage() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.direction = 'rtl'
    ctx.textBaseline = 'top'
    this.pages.push(c)
    this.ctx = ctx
    this.y = M
  }

  ensure(h: number) {
    if (this.y + h > H - M - 40) this.newPage()
  }

  font(size: number, weight = 400, color = C.fg) {
    this.ctx.font = `${weight} ${size}px ${FONT}`
    this.ctx.fillStyle = color
  }

  /** Splits text into lines that fit maxW */
  wrap(text: string, maxW: number): string[] {
    const words = text.split(/\s+/)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (this.ctx.measureText(next).width > maxW && cur) {
        lines.push(cur)
        cur = w
      } else cur = next
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }

  text(t: string, size = 24, weight = 400, color = C.fg, gap = 10) {
    this.font(size, weight, color)
    const lines = this.wrap(t, W - 2 * M)
    const lh = size * 1.7
    this.ensure(lines.length * lh)
    this.ctx.textAlign = 'right'
    for (const l of lines) {
      this.ctx.fillText(l, W - M, this.y)
      this.y += lh
    }
    this.y += gap
  }

  heading(t: string) {
    this.ensure(110)
    this.y += 24
    this.ctx.fillStyle = C.accent
    this.ctx.fillRect(W - M - 8, this.y + 6, 8, 34)
    this.font(32, 800)
    this.ctx.textAlign = 'right'
    this.ctx.fillText(t, W - M - 22, this.y)
    this.y += 62
  }

  /** One table row; columns run right-to-left */
  row(cells: string[], cols: Col[], opts: { header?: boolean; zebra?: boolean } = {}) {
    const size = opts.header ? 21 : 22
    this.font(size, opts.header ? 700 : 400, opts.header ? C.muted : C.fg)
    const inner = W - 2 * M
    const pad = 14
    const wrapped = cells.map((c, i) => this.wrap(c, cols[i].w * inner - pad * 2))
    const lh = size * 1.6
    const h = Math.max(...wrapped.map((l) => l.length)) * lh + pad * 1.4
    this.ensure(h)
    if (opts.header || opts.zebra) {
      this.ctx.fillStyle = opts.header ? C.soft : '#fafbfc'
      this.ctx.fillRect(M, this.y, inner, h)
      this.font(size, opts.header ? 700 : 400, opts.header ? C.muted : C.fg)
    }
    let x = W - M
    wrapped.forEach((lines, i) => {
      const cw = cols[i].w * inner
      const align = cols[i].align ?? 'right'
      this.ctx.textAlign = align
      const tx = align === 'right' ? x - pad : align === 'left' ? x - cw + pad : x - cw / 2
      lines.forEach((l, j) => this.ctx.fillText(l, tx, this.y + pad * 0.7 + j * lh))
      x -= cw
    })
    this.y += h
    this.ctx.fillStyle = C.line
    this.ctx.fillRect(M, this.y - 1, inner, 1)
  }

  statBoxes(items: { label: string; value: string }[]) {
    const gap = 20
    const bw = (W - 2 * M - gap * (items.length - 1)) / items.length
    const bh = 120
    this.ensure(bh + 20)
    items.forEach((it, i) => {
      const x = W - M - (i + 1) * bw - i * gap
      this.ctx.fillStyle = C.soft
      this.roundRect(x, this.y, bw, bh, 18)
      this.ctx.textAlign = 'right'
      this.font(20, 400, C.muted)
      this.ctx.fillText(it.label, x + bw - 24, this.y + 22)
      this.font(30, 800)
      this.ctx.fillText(it.value, x + bw - 24, this.y + 60)
    })
    this.y += bh + 24
  }

  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }

  footers(title: string) {
    this.pages.forEach((c, i) => {
      const ctx = c.getContext('2d')!
      ctx.direction = 'rtl'
      ctx.textBaseline = 'top'
      ctx.font = `400 18px ${FONT}`
      ctx.fillStyle = C.muted
      ctx.textAlign = 'right'
      ctx.fillText(title, W - M, H - M + 10)
      ctx.textAlign = 'left'
      ctx.fillText(`صفحه ${toFa(i + 1)} از ${toFa(this.pages.length)}`, M, H - M + 10)
      ctx.fillStyle = C.line
      ctx.fillRect(M, H - M - 4, W - 2 * M, 1)
    })
  }
}

export async function renderReport(data: ActiveCar, opts: ReportOptions): Promise<HTMLCanvasElement[]> {
  await Promise.all([document.fonts.load(`400 24px ${FONT}`), document.fonts.load(`800 24px ${FONT}`)])
  const p = new Painter()
  const partName = (id: string) => data.model.parts.find((x) => x.id === id)?.name ?? id
  const latest = latestKm(data.readings, data.services)
  const services = [...data.services].sort((a, b) => b.date - a.date || b.km - a.km)

  // Title band
  p.ctx.fillStyle = C.accent
  p.ctx.fillRect(0, 0, W, 220)
  p.ctx.textAlign = 'right'
  p.font(46, 800, '#fff')
  p.ctx.fillText('گزارش سوابق نگهداری خودرو', W - M, 62)
  p.font(24, 400, 'rgba(255,255,255,.85)')
  p.ctx.fillText(`تاریخ گزارش: ${fmtDateShort(Date.now())}`, W - M, 136)
  p.y = 260

  const carLine = [data.car.name, data.model.name, data.car.year ? `مدل ${toFa(data.car.year)}` : '', data.car.transmission === 'auto' ? 'اتوماتیک' : 'دنده‌ای'].filter(Boolean).join(' • ')
  p.text(carLine, 30, 800, C.fg, 2)
  p.text(`موتور: ${data.model.engine}${opts.plate && data.car.plate ? ` • پلاک: ${data.car.plate}` : ''}`, 22, 400, C.muted, 20)

  const total = services.reduce((a, s) => a + (s.cost ?? 0), 0)
  const visits = new Set(services.map((s) => s.visitId ?? `s${s.id}`)).size
  const first = services.at(-1)
  p.statBoxes([
    { label: 'آخرین کیلومتر ثبت‌شده', value: latest ? fmtNum(latest.km) : '—' },
    { label: 'تعداد مراجعه‌ها', value: toFa(visits) },
    opts.costs ? { label: 'مجموع هزینه‌ی نگهداری', value: total ? fmtToman(total) : '—' } : { label: 'سابقه از', value: first ? fmtDateShort(first.date) : '—' },
  ])

  // Current state of tracked parts
  const statuses = allStatuses(data).filter((s) => s.last)
  if (statuses.length) {
    p.heading('وضعیت فعلی قطعات')
    const cols: Col[] = [{ w: 0.34 }, { w: 0.22, align: 'center' }, { w: 0.2, align: 'center' }, { w: 0.24, align: 'center' }]
    p.row(['قطعه', 'آخرین تعویض (کیلومتر)', 'تاریخ', 'موعد بعدی'], cols, { header: true })
    statuses
      .sort((a, b) => Object.keys(CATEGORIES).indexOf(a.part.category) - Object.keys(CATEGORIES).indexOf(b.part.category))
      .forEach((s, i) => {
        const next = s.dueKm ? fmtKm(s.dueKm) : s.dueDate ? fmtDateShort(s.dueDate) : '—'
        p.row([s.part.name, fmtNum(s.last!.km), fmtDateShort(s.last!.date), next], cols, { zebra: i % 2 === 1 })
      })
  }

  // Service history grouped by visit
  if (services.length) {
    p.heading('سابقه‌ی تعویض‌ها و سرویس‌ها')
    const groups = new Map<string, typeof services>()
    for (const s of services) {
      const k = s.visitId ?? `s${s.id}`
      groups.set(k, [...(groups.get(k) ?? []), s])
    }
    const cols: Col[] = opts.costs
      ? [{ w: 0.15, align: 'center' }, { w: 0.15, align: 'center' }, { w: 0.4 }, { w: 0.15, align: 'center' }, { w: 0.15 }]
      : [{ w: 0.16, align: 'center' }, { w: 0.16, align: 'center' }, { w: 0.48 }, { w: 0.2 }]
    p.row(opts.costs ? ['تاریخ', 'کیلومتر', 'شرح', 'هزینه', 'تعمیرگاه'] : ['تاریخ', 'کیلومتر', 'شرح', 'تعمیرگاه'], cols, { header: true })
    let i = 0
    for (const g of groups.values()) {
      const s = g[0]
      const items = g.map((x) => partName(x.partId) + (x.brand ? ` (${x.brand})` : '')).join('، ') + (s.notes ? ` — ${s.notes}` : '')
      const cost = g.reduce((a, x) => a + (x.cost ?? 0), 0)
      const cells = [fmtDateShort(s.date), fmtNum(s.km), items]
      if (opts.costs) cells.push(cost ? fmtNum(cost) : '—')
      cells.push(s.shop ?? '—')
      p.row(cells, cols, { zebra: i++ % 2 === 1 })
    }
  }

  const docs = currentDocuments(data.documents)
  if (docs.length) {
    p.heading('مدارک')
    const cols: Col[] = [{ w: 0.4 }, { w: 0.3, align: 'center' }, { w: 0.3 }]
    p.row(['مدرک', 'اعتبار تا', 'صادرکننده'], cols, { header: true })
    docs.forEach((d, i) => p.row([docName(d), fmtDateShort(d.expiresAt), d.company ?? '—'], cols, { zebra: i % 2 === 1 }))
  }

  const resolved = data.symptoms.filter((s) => s.status === 'resolved').sort((a, b) => b.date - a.date)
  if (opts.symptoms && resolved.length) {
    p.heading('ایرادهای برطرف‌شده')
    const cols: Col[] = [{ w: 0.18, align: 'center' }, { w: 0.42 }, { w: 0.4 }]
    p.row(['تاریخ', 'ایراد', 'راه‌حل'], cols, { header: true })
    resolved.forEach((s, i) => p.row([fmtDateShort(s.date), s.title, s.resolution ?? '—'], cols, { zebra: i % 2 === 1 }))
  }

  p.y += 20
  p.text('این گزارش از روی سوابق ثبت‌شده توسط مالک در برنامه‌ی «کارکر» تهیه شده است.', 18, 400, C.muted)
  p.footers(`${data.car.name} — گزارش کارکر`)
  return p.pages
}

export async function canvasesToPdf(pages: HTMLCanvasElement[]): Promise<Uint8Array<ArrayBuffer>> {
  const out: PdfPage[] = []
  for (const c of pages) {
    const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('toBlob failed'))), 'image/jpeg', 0.88))
    out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height })
  }
  return imagesToPdf(out)
}
