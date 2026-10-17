import type { Reminder } from './schedule'

function stamp(ts: number): string {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

/** Folds a content line at 75 octets without splitting UTF-8 characters (RFC 5545 §3.1) */
function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = parts.length ? 74 : 75
    if (bytes + n > limit) {
      parts.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

/**
 * iCalendar file with one alarmed event per reminder. Importing it into the
 * iPhone Calendar gives notifications that work fully offline, with no push
 * server involved.
 */
export function toICS(reminders: Reminder[], appUrl: string): string {
  const now = stamp(Date.now())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CarCare//FA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:کارکر — یادآور خودرو']
  for (const r of reminders) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@carcare`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(r.at)}`,
      `DTEND:${stamp(r.at + 15 * 60_000)}`,
      `SUMMARY:${esc(r.title)}`,
      `DESCRIPTION:${esc(r.body)}`,
      `URL:${appUrl}${r.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(r.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  // RFC 5545 asks for CRLF line endings
  return lines.map(fold).join('\r\n')
}
