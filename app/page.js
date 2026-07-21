import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-orange-50 to-white px-6 py-12 text-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 rounded-3xl border border-orange-200 bg-white/90 p-10 shadow-xl shadow-orange-100">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-orange-600">PT Visitiga Media</p>
          <h1 className="text-4xl font-semibold text-slate-900">Visitiga Absensi</h1>
          <p className="mx-auto max-w-2xl text-base leading-8 text-slate-600">
            Solusi absensi karyawan berbasis lokasi, selfie, dan laporan kerja. Cek login untuk memulai.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link className="rounded-2xl bg-orange-500 px-6 py-4 text-center text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600" href="/login">
            Masuk ke Aplikasi
          </Link>
          <div className="rounded-2xl border border-orange-100 bg-slate-50 px-6 py-4 text-slate-700">
            <h2 className="text-lg font-medium text-slate-900">Alamat Kantor</h2>
            <p className="mt-3 text-sm leading-7">Jl. Setra Dago Barat No.9 Antapani, Bandung</p>
            <p className="mt-2 text-sm text-slate-600">Koordinat: -6.9147, 107.6558</p>
          </div>
        </div>
      </div>
    </main>
  );
}
