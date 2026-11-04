// Batas Suspense untuk semua halaman di grup (app).
// Dengan Cache Components, halaman yang membaca sesi/data Supabase harus berada
// di dalam <Suspense> agar route tidak dianggap "blocking".
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <span className="sr-only">Memuat halaman...</span>
      <div aria-hidden="true" className="atm-skeleton h-9 w-64" />
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="atm-skeleton h-24" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div aria-hidden="true" className="atm-skeleton h-72" />
    </div>
  )
}
