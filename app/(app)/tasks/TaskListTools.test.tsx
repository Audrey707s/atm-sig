// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TaskListTools from './TaskListTools'
beforeEach(() => localStorage.clear())
afterEach(cleanup)
const props = { userId: 'user-a', query: 'mine=1&status=Revisi&page=5', mine: true, roleLevel: 2 }
describe('task tools', () => {
  it('saves a filter without pagination and lets the user remove it', () => {
    render(<TaskListTools {...props} />)
    fireEvent.change(screen.getByLabelText('Nama filter tersimpan'), { target: { value: 'Revisi saya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan filter' }))
    expect(screen.getByRole('link', { name: 'Revisi saya' }).getAttribute('href')).toBe('/tasks?status=Revisi&mine=1')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter Revisi saya' }))
    expect(screen.queryByRole('link', { name: 'Revisi saya' })).toBeNull()
  })
  it('isolates saved filters by account and ignores corrupted data', () => {
    localStorage.setItem('atm:task-filters:v1:user-a', JSON.stringify([{ name: 'Privat', query: 'status=Review' }]))
    const view = render(<TaskListTools {...props} />)
    expect(screen.getByRole('link', { name: 'Privat' })).toBeTruthy()
    view.rerender(<TaskListTools {...props} userId="user-b" />)
    expect(screen.queryByRole('link', { name: 'Privat' })).toBeNull()
  })
  it('clears page when changing density and hides higher-role shortcuts', () => {
    render(<TaskListTools {...props} />)
    expect(screen.getByRole('link', { name: 'Tampilan ringkas' }).getAttribute('href')).not.toContain('page=')
    expect(screen.queryByRole('link', { name: 'Review ditugaskan' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Persetujuan tenggat' })).toBeNull()
  })
})
