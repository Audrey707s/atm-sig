'use client'

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-auto max-w-xl px-4 py-12 text-center" role="alert">
    <h1 className="text-xl font-semibold">Halaman belum dapat dimuat</h1>
    <p className="mt-3 text-sm text-slate-500">Periksa koneksi lalu coba kembali. Jika sedang mengisi tugas, periksa daftar sebelum mengirim ulang.</p>
    <button type="button" onClick={reset} className="mt-5 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white">Coba lagi</button>
  </section>
}
