// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskTemplateManager from './TaskTemplateManager'

vi.mock('@/lib/task-masters/actions', () => ({
  saveTaskCategory: vi.fn(), deleteTaskCategory: vi.fn(), saveTaskTemplate: vi.fn(),
  toggleTaskTemplate: vi.fn(), deleteTaskTemplate: vi.fn(),
}))

const base = {
  sections: [{ id: 4, name: 'Cost Accounting', unitName: 'Accounting', parentId: 2 }],
  people: [
    { id: 'pic', name: 'Nata', roleLevel: 2, orgUnitId: 4, supervisorId: 'manager' },
    { id: 'manager', name: 'Manager', roleLevel: 3, orgUnitId: 4, supervisorId: 'sm' },
  ],
  categories: [{ id: 'category', orgUnitId: 4, name: 'Rekonsiliasi', isActive: true }],
  templates: [],
  canAssignGlobalOwner: false,
}

afterEach(cleanup)

describe('TaskTemplateManager role presentation', () => {
  it('shows PIC categories as read-only', () => {
    render(<TaskTemplateManager {...base} canManageCategories={false} ownerSelectionUserId="pic" />)
    expect(screen.getByText('Rekonsiliasi')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tambah kategori' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hapus kategori' })).toBeNull()
  })

  it('offers recurring creation to PIC while limiting the owner to self', () => {
    render(<TaskTemplateManager {...base} canManageCategories={false} ownerSelectionUserId="pic" mode="recurring" />)
    expect(screen.getByText('＋ Tambah tugas berulang')).toBeTruthy()
  })
})
