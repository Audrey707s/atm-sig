import type { ReactNode } from 'react'

export default function AppPageTemplate({ children }: { children: ReactNode }) {
  return <div className="atm-page-transition min-h-full">{children}</div>
}
