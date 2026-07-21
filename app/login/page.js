"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session?.user?.id) {
        await redirectWithRole(session.user.id);
      }
    }
    checkSession();
  }, []);

  async function redirectWithRole(userId) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.role) {
      return;
    }

    if (profile.role === "admin") {
      router.replace("/admin");
      return;
    }

    router.replace("/dashboard");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (!data?.user?.id) {
      setError("Login gagal. Pastikan email dan password benar.");
      return;
    }

    await redirectWithRole(data.user.id);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-orange-100 bg-white shadow-2xl shadow-orange-100/40">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-400 px-10 py-12 text-white lg:rounded-r-none lg:rounded-l-[32px]">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.35em] text-orange-100/90">PT Visitiga Media</p>
              <h1 className="text-4xl font-semibold">Absensi Karyawan</h1>
              <p className="max-w-xl text-base leading-7 text-orange-100/90">
                Login untuk mengakses dashboard absensi dengan fitur selfie dan geofence. Hanya akun terdaftar yang dapat masuk.
              </p>
            </div>
            <div className="mt-10 space-y-4 rounded-3xl bg-white/10 p-6 text-sm text-orange-100 shadow-inner shadow-orange-200/20">
              <p className="font-semibold">Perhatian:</p>
              <ul className="space-y-2 pl-4 text-orange-100/90">
                <li>- Akun Admin diarahkan ke panel Owner/Admin.</li>
                <li>- Akun Karyawan diarahkan ke dashboard pribadi.</li>
                <li>- Autentikasi role diambil dari data Supabase.</li>
              </ul>
            </div>
          </section>

          <section className="p-10">
            <h2 className="text-2xl font-semibold text-slate-900">Masuk ke Visitiga Absensi</h2>
            <p className="mt-2 text-sm text-slate-500">
              Gunakan email dan kata sandi akun resmi kantor.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email kantor</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="nama@visitiga.com"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="Masukkan password"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
              <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-900">
                <p className="font-semibold">Role login otomatis</p>
                <p className="mt-2 text-slate-700">Sistem akan mendeteksi apakah akun Anda karyawan atau admin berdasarkan data Supabase.</p>
              </div>

              {error ? <p className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              {message ? <p className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-3xl bg-orange-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
              >
                {loading ? "Memproses..." : "Masuk Sekarang"}
              </button>
            </form>

            <div className="mt-8 rounded-3xl border border-orange-100 bg-orange-50 p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Tip</p>
              <p className="mt-2">Gunakan email dan password perangkat perusahaan. Sistem akan otomatis mendeteksi role admin atau karyawan berdasarkan data Supabase.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
