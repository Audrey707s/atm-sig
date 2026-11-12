// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const navigation = vi.hoisted(() => ({ pathname: '/tasks', router: { refresh: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }))
import TaskDataSync from './TaskDataSync'
function tick() { act(() => vi.advanceTimersByTime(30_000)) }
describe('Task view synchronization after external changes', () => {
  beforeEach(() => {
    vi.useFakeTimers(); navigation.pathname = '/tasks'; navigation.router.refresh.mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = '' })
  it('refreshes task data periodically without immediate duplicate requests', () => {
    render(<TaskDataSync />)
    expect(navigation.router.refresh).not.toHaveBeenCalled()
    tick(); expect(navigation.router.refresh).toHaveBeenCalledOnce()
    act(() => {window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))})
    expect(navigation.router.refresh).toHaveBeenCalledOnce()
  })
  it('pauses in background or offline and refreshes when visible again', () => {
    render(<TaskDataSync />)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); tick()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); tick()
    expect(navigation.router.refresh).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => window.dispatchEvent(new Event('online')))
    expect(navigation.router.refresh).toHaveBeenCalledOnce()
  })
  it('defers refresh while a user is editing a field or modal', () => {
    render(<TaskDataSync />)
    const input = document.createElement('input');document.body.append(input);input.focus();tick()
    expect(navigation.router.refresh).not.toHaveBeenCalled();input.blur()
    const dialog = document.createElement('dialog');dialog.setAttribute('open','');document.body.append(dialog);tick()
    expect(navigation.router.refresh).not.toHaveBeenCalled();dialog.remove();tick()
    expect(navigation.router.refresh).toHaveBeenCalledOnce()
  })
  it.each(['/tasks/new','/tasks/recurring','/account','/users','/tasks/33333333-3333-4333-8333-333333333333/review'])('does not refresh form/account route %s', pathname => {
    navigation.pathname = pathname;render(<TaskDataSync />);tick();expect(navigation.router.refresh).not.toHaveBeenCalled()
  })
  it('cleans up timers and listeners after leaving a task view', () => {
    const {unmount} = render(<TaskDataSync />);unmount();tick()
    act(() => window.dispatchEvent(new Event('focus')))
    expect(navigation.router.refresh).not.toHaveBeenCalled()
  })
})
