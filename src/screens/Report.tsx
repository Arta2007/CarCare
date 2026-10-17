import { useEffect, useState } from 'react'
import { FileDown, Share } from 'lucide-react'
import type { ActiveCar } from '../lib/store'
import { canvasesToPdf, renderReport, type ReportOptions } from '../lib/report'
import { saveFile } from '../lib/files'
import { jalali } from '../lib/format'
import { Button, Card, Chip, PageHeader, toast } from '../components/ui'

export function ReportScreen({ data }: { data: ActiveCar }) {
  const [opts, setOpts] = useState<ReportOptions>({ costs: true, plate: false, symptoms: true })
  const [pdf, setPdf] = useState<Uint8Array<ArrayBuffer> | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setPdf(null)
    // Built ahead of time: iOS only opens the share sheet right after a tap
    renderReport(data, opts).then(async (p) => {
      if (cancelled) return
      setPreviews(p.map((c) => c.toDataURL('image/jpeg', 0.6)))
      const bytes = await canvasesToPdf(p)
      if (cancelled) return
      setPdf(bytes)
      setBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [data, opts])

  async function share() {
    if (!pdf) return
    const { jy, jm, jd } = jalali(Date.now())
    const r = await saveFile(`carcare-${data.car.name}-${jy}-${jm}-${jd}.pdf`, pdf, 'application/pdf')
    if (r !== 'cancelled') toast('PDF آماده شد ✓')
  }

  const toggle = (k: keyof ReportOptions) => setOpts((o) => ({ ...o, [k]: !o[k] }))

  return (
    <div className="pb-tabbar">
      <PageHeader back title="گزارش PDF" subtitle="سوابق نگهداری برای خریدار یا تعمیرکار" />
      <div className="px-4">
        <Card className="p-4">
          <p className="mb-3 text-sm leading-6 text-muted">یک سند مرتب از همه‌ی تعویض‌ها، وضعیت فعلی قطعات و مدارک. موقع فروش، داشتن سابقه‌ی سرویس منظم به قیمت ماشین اضافه می‌کند.</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={opts.costs} onClick={() => toggle('costs')}>نمایش هزینه‌ها</Chip>
            <Chip active={opts.plate} onClick={() => toggle('plate')}>نمایش پلاک</Chip>
            <Chip active={opts.symptoms} onClick={() => toggle('symptoms')}>ایرادهای برطرف‌شده</Chip>
          </div>
          <Button className="mt-4 w-full" disabled={busy || !pdf} onClick={share}>
            {busy ? 'در حال ساخت…' : <><Share className="size-5" />ساخت و ارسال PDF</>}
          </Button>
        </Card>
        <p className="mb-2 mt-5 flex items-center gap-2 px-1 text-sm font-bold text-muted"><FileDown className="size-4" />پیش‌نمایش</p>
        <div className="space-y-3">
          {previews.map((src, i) => (
            <img key={i} src={src} alt={`صفحه ${i + 1}`} className="w-full rounded-xl shadow-lg ring-1 ring-line" />
          ))}
        </div>
      </div>
    </div>
  )
}
