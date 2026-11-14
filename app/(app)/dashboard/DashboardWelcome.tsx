import NavIcon from '../_components/NavIcon'

export default function DashboardWelcome({ name }: { name: string }) {
  return <div><p className="mb-2 text-sm text-[var(--color-text-muted)]">Selamat Datang, {name}!</p><h1 className="flex items-center gap-3"><NavIcon name="dashboard" className="h-6 w-6 text-[var(--color-brand)]"/>Dashboard</h1></div>
}
