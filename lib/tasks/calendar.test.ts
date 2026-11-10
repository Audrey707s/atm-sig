import { describe, expect, it } from 'vitest'
import { taskCalendar, taskCsv } from './calendar'
import type { TaskListItem } from './queries'
const task = { id: 'id', title: 'Closing, November; 2026', dueDate: '2026-11-30T23:59:59+07:00', ownerName: 'PIC', orgUnitName: 'Accounting', status: 'Review', priority: 'tinggi', progressPct: 100 } as TaskListItem

describe('task exports', () => {
  it('uses UTC instants, stable IDs and escaped text without event injection', () => {
    const ics = taskCalendar([{ ...task, title: 'Tugas\r\nBEGIN:VEVENT' }], 'https://atm-sig.vercel.app', new Date('2026-11-10T00:00:00Z'))
    expect(ics).toContain('DTSTART:20261130T165959Z')
    expect(ics).toContain('SUMMARY:Tugas\\nBEGIN:VEVENT')
    expect(ics.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('UID:id@atm-sig')
    expect(ics).toContain('URL:https://atm-sig.vercel.app/tasks/id')
  })
  it('folds Unicode lines within 75 UTF-8 octets', () => {
    const ics = taskCalendar([{ ...task, title: '💼'.repeat(80) }], 'https://atm-sig.vercel.app')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics.replace(/\r\n /g, '')).toContain('💼'.repeat(80))
  })
  it('protects spreadsheet formulas and quotes', () => {
    const csv = taskCsv([{ ...task, title: '  =HYPERLINK("x")', ownerName: '+PIC' }])
    expect(csv).toContain('"\'  =HYPERLINK(""x"")"')
    expect(csv).toContain('"\'+PIC"')
  })
})
