/**
 * Minimal PDF writer: one full-page JPEG per page. Pages are drawn on a
 * canvas first, which gets Persian shaping and RTL right everywhere —
 * something PDF text libraries still struggle with.
 */
export interface PdfPage {
  jpeg: Uint8Array
  /** Pixel size of the JPEG */
  width: number
  height: number
}

const A4 = { w: 595.28, h: 841.89 }

export function imagesToPdf(pages: PdfPage[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let size = 0
  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(bytes)
    size += bytes.length
  }
  const obj = (id: number, body: () => void) => {
    offsets[id] = size
    write(`${id} 0 obj\n`)
    body()
    write('\nendobj\n')
  }

  // Object ids: 1 catalog, 2 page tree, then 3 per page (page, content, image)
  const pageId = (i: number) => 3 + i * 3
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  obj(1, () => write('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => write(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`))
  pages.forEach((p, i) => {
    const id = pageId(i)
    // Fit the image into A4 width, keeping its aspect ratio
    const h = (A4.w * p.height) / p.width
    const content = `q ${A4.w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${(A4.h - h).toFixed(2)} cm /Im0 Do Q`
    obj(id, () => write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`))
    obj(id + 1, () => write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`))
    obj(id + 2, () => {
      write(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
      write(p.jpeg)
      write('\nendstream')
    })
  })

  const count = 3 + pages.length * 3
  const xref = size
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let i = 1; i < count; i++) write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}
