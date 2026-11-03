'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
}

export default function TableFilterMenu({ label, children }: Props) {
  const rawId = useId().replace(/:/g, '')
  const popoverId = `table-filter-${rawId}`
  const anchor = `--table-filter-${rawId}`
  const anchorStyle = { anchorName: anchor } as CSSProperties
  const popoverStyle = {
    positionAnchor: anchor,
    positionArea: 'bottom span-right',
  } as CSSProperties

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span>{label}</span>
      <button
        type="button"
        popoverTarget={popoverId}
        aria-label={`Filter ${label}`}
        style={anchorStyle}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-200 bg-white/75 text-red-700 shadow-sm hover:border-red-300 hover:bg-white hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
          <path d="M5.2 7.3a1 1 0 0 1 1.4 0L10 10.7l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      <div
        id={popoverId}
        popover="auto"
        style={popoverStyle}
        className="m-0 min-w-56 rounded-lg border border-slate-200 border-t-2 border-t-red-600 bg-white p-3 shadow-xl [inset:auto]"
      >
        {children}
      </div>
    </div>
  )
}
