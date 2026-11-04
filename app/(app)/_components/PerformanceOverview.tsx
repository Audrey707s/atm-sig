import type { DashboardPerformance } from '@/lib/dashboard/queries'

type Props = {
  performance: DashboardPerformance
}

function ProgressTrack({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="atm-progress-track h-1.5"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div
        className="atm-progress-fill h-full rounded-full"
        style={{ width: `${value}%`, backgroundColor: 'var(--color-brand)' }}
      />
    </div>
  )
}

export default function PerformanceOverview({
  performance,
}: Props) {
  return (
    <section aria-label="Progress per PIC dan section" className="atm-stagger grid gap-4 lg:grid-cols-2">
      <div className="atm-card atm-spotlight p-5">
        <h2 className="atm-eyebrow !text-[var(--color-text-secondary)]">Progress per PIC</h2>
        {performance.owners.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Belum ada task aktif dalam cakupan Anda.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {performance.owners.map((owner) => (
              <li key={owner.id} className="grid grid-cols-[minmax(5rem,8rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="truncate font-medium text-slate-700">{owner.name}</span>
                <ProgressTrack
                  value={owner.averageProgress}
                  label={`Progress rata-rata ${owner.name}`}
                />
                <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] tabular-nums text-slate-600">
                  {owner.averageProgress}% · {owner.activeTasks} aktif
                </span>
                {owner.overdueTasks > 0 && (
                  <span className="col-start-2 text-[11px] font-medium text-red-700">
                    {owner.overdueTasks} task lewat tenggat
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="atm-card atm-spotlight p-5">
        <h2 className="atm-eyebrow !text-[var(--color-text-secondary)]">Progress per Section/Unit</h2>
        {performance.orgUnits.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Belum ada task aktif dalam cakupan Anda.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {performance.orgUnits.map((orgUnit) => (
              <li key={orgUnit.id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-xs">
                <span className="truncate font-medium text-slate-700">{orgUnit.name}</span>
                <ProgressTrack
                  value={orgUnit.averageProgress}
                  label={`Progress rata-rata ${orgUnit.name}`}
                />
                <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] tabular-nums text-slate-600">
                  {orgUnit.averageProgress}% · {orgUnit.activeTasks} aktif
                </span>
                {orgUnit.overdueTasks > 0 && (
                  <span className="col-start-2 text-[11px] font-medium text-red-700">
                    {orgUnit.overdueTasks} task lewat tenggat
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
