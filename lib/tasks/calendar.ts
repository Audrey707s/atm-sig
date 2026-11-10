import type { TaskListItem } from './queries'

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const timestamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
// RFC 5545 lines are folded at 75 octets, never in the middle of a UTF-8 character.
function fold(line: string): string {
  let result = '', chunk = '', size = 0
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length
    if (size + bytes > 75) { result += chunk + '\r\n'; chunk = ' '; size = 1 }
    chunk += character; size += bytes
  }
  return result + chunk
}
export function taskCalendar(tasks: TaskListItem[], origin: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ATM-SIG//Task Calendar//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Tenggat ATM-SIG']
  for (const task of tasks) {
    if (!Number.isFinite(Date.parse(task.dueDate))) continue
    lines.push('BEGIN:VEVENT', `UID:${task.id}@atm-sig`, `DTSTAMP:${timestamp(now.toISOString())}`,
      `DTSTART:${timestamp(task.dueDate)}`, `SUMMARY:${escape(task.title)}`,
      `DESCRIPTION:${escape(`PIC: ${task.ownerName}\nStatus: ${task.status}\nKemajuan: ${task.progressPct}%`)}`,
      `URL:${new URL(`/tasks/${encodeURIComponent(task.id)}`, origin).href}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  return lines.map(fold).join('\r\n') + '\r\nEND:VCALENDAR\r\n'
}
export function taskCsv(tasks: TaskListItem[]): string {
  const cell = (value: string | number) => {
    const text = String(value)
    // Prevent spreadsheet formula execution, including whitespace/control prefixes.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const rows: Array<Array<string | number>> = [['Judul', 'PIC', 'Seksi', 'Status', 'Prioritas', 'Kemajuan (%)', 'Tenggat (WIB)']]
  for (const task of tasks) rows.push([task.title, task.ownerName, task.orgUnitName, task.status, task.priority, task.progressPct,
    new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.dueDate))])
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
