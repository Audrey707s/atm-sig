// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApprovalClient from './ApprovalClient'

const { router, approveDeadlineChange } = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  approveDeadlineChange: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/tasks/actions', () => ({ approveDeadlineChange }))

const requests = [{
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  taskId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  taskTitle: 'Rekonsiliasi bank',
  requesterName: 'Sari',
  orgUnitName: 'Seksi Accounting',
  oldDueDate: '2026-10-30T00:00:00.000Z',
  newDueDate: '2026-11-02T00:00:00.000Z',
  reason: 'Menunggu dokumen bank',
  createdAt: '2026-10-20T00:00:00.000Z',
  status: 'Menunggu approval' as const,
}]

describe('ApprovalClient (docs/07 #8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    approveDeadlineChange.mockResolvedValue({ data: { success: true } })
  })

  afterEach(cleanup)

  it('renders real request details and approves through the server action', async () => {
    render(<ApprovalClient requests={requests} />)

    expect(screen.getByText('Rekonsiliasi bank')).toBeTruthy()
    expect(screen.getByText('Menunggu dokumen bank')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Setujui' }))

    await waitFor(() => {
      expect(approveDeadlineChange).toHaveBeenCalledWith({
        requestId: requests[0].id,
        decision: 'Disetujui',
      })
    })
    expect(router.refresh).toHaveBeenCalled()
  })

  it('shows an empty state when there are no pending requests', () => {
    render(<ApprovalClient requests={[]} />)
    expect(screen.getByText(/Belum ada pengajuan perubahan deadline/)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
