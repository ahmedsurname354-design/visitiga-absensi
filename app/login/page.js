"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { getSupabaseClient } from "@/lib/supabase";
import { isWithinOfficeRadius } from "@/lib/geofence";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const router = useRouter();
  const webcamRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [geoCheckMessage, setGeoCheckMessage] = useState("");
  const [geoCheckStatus, setGeoCheckStatus] = useState({ distance: null, isInside: false });

  function normalizeRole(role) {
    if (!role) return null;
    const normalized = role.toString().toLowerCase().trim();
    if (normalized === "karyawan") return "employee";
    return normalized;
  }

  // Fungsi fallback jika profile belum terbuat di Supabase DB
  const ensureProfileExists = useCallback(async (userId, userEmail, token) => {
    if (!userEmail || !token) return null;

    try {
      const response = await fetch("/api/ensure-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          id: userId, 
          email: userEmail, 
          name: userEmail.split("@")[0] || "Pengguna" 
        }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      return normalizeRole(json.role);
    } catch (err) {
      console.error("Supabase ensureProfileExists error:", err);
      return null;
    }
  }, []);

  const capturePhotoAndCheckLocation = useCallback(async () => {
    setGeoCheckMessage("Mencapture foto dan memeriksa lokasi...");

    // ambil foto dari webcam
    const imageSrc = webcamRef.current?.getScreenshot?.();
    if (!imageSrc) {
      setGeoCheckMessage("Gagal mengambil foto. Pastikan kamera diizinkan.");
      return;
    }
    setPhotoPreview(imageSrc);
    setPhotoTaken(true);

    // geolocation sampling mirip dengan dashboard
    if (!navigator.geolocation) {
      setGeoCheckMessage("Perangkat tidak mendukung GPS.");
      return;
    }

    const samples = [];
    const maxSamples = 3;

    const trySample = (attempt = 1) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          samples.push(position.coords);
          if ((position.coords.accuracy || Infinity) <= 50) {
            const r = isWithinOfficeRadius(position.coords.latitude, position.coords.longitude);
            setGeoCheckStatus(r);
            setGeoCheckMessage(r.isInside ? "Foto: Anda berada di area kantor." : `Foto: Anda di luar area kantor (jarak ${Math.round(r.distance)} m)`);
            return;
          }
          if (attempt < maxSamples) {
            setTimeout(() => trySample(attempt + 1), 500);
            return;
          }

          const best = samples.reduce((prev, cur) => {
            if (!prev) return cur;
            return (cur.accuracy || Infinity) < (prev.accuracy || Infinity) ? cur : prev;
          }, null);

          if (!best) {
            setGeoCheckMessage("Gagal mendapatkan posisi yang akurat.");
            return;
          }

          const r = isWithinOfficeRadius(best.latitude, best.longitude);
          setGeoCheckStatus(r);
          setGeoCheckMessage(r.isInside ? "Foto: Anda berada di area kantor." : `Foto: Anda di luar area kantor (jarak ${Math.round(r.distance)} m)`);
        },
        (err) => {
          console.error("GPS Error:", err);
          setGeoCheckMessage("Gagal mendapatkan lokasi. Pastikan GPS/wi-fi aktif dan izinkan lokasi.");
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    };

    trySample(1);
  }, []);

  // Mengambil Role dari DB / Metadata
  const getProfileRole = useCallback(async (userId, userEmail, token) => {
    const supabase = getSupabaseClient();

    // 1. Cek berdasarkan ID di DB
    const { data: profileById } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileById?.role) {
      return normalizeRole(profileById.role);
    }

    // 2. Cek berdasarkan Email di DB
    const { data: profileByEmail } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", userEmail)
      .maybeSingle();

    if (profileByEmail?.role) {
      return normalizeRole(profileByEmail.role);
    }

    // 3. Fallback panggil API ensure-profile
    return await ensureProfileExists(userId, userEmail, token);
  }, [ensureProfileExists]);

  const redirectWithRole = useCallback(async (session) => {
    if (!session?.user) return null;
    
    const userId = session.user.id;
    const userEmail = session.user.email;
    const token = session.access_token;
    
    const metadataRole = normalizeRole(session.user?.user_metadata?.role);
    const profileRole = await getProfileRole(userId, userEmail, token);

    return profileRole || metadataRole || "employee";
  }, [getProfileRole]);

  // Cek jika user sudah punya session aktif saat buka halaman
  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        
        if (session?.user?.id && isMounted) {
          const role = await redirectWithRole(session);
          if (role === "admin") {
            router.replace("/admin");
            return;
          }
          if (role) {
            router.replace("/dashboard");
            return;
          }
        }
      } catch (err) {
        console.error("Session check error:", err);
      } finally {
        if (isMounted) setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [router, redirectWithRole]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      // require photo-first
      if (!photoTaken) throw new Error("Silakan ambil foto dan cek lokasi terlebih dahulu.");

      const supabase = getSupabaseClient();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        // Terjemahkan error Supabase ke Bahasa Indonesia
        if (loginError.message.includes("Invalid login credentials")) {
          throw new Error("Email atau password yang Anda masukkan salah.");
        } else if (loginError.message.includes("Email not confirmed")) {
          throw new Error("Email Anda belum dikonfirmasi. Cek kotak masuk email Anda.");
        } else {
          throw new Error(loginError.message);
        }
      }

      if (!data?.user?.id || !data?.session) {
        throw new Error("Gagal melakukan verifikasi autentikasi.");
      }

      const role = await redirectWithRole(data.session);

      if (role === "admin") {
        setMessage("Login berhasil! Mengalihkan ke halaman Owner...");
        router.replace("/admin");
        return;
      }

      setMessage("Login berhasil! Mengalihkan ke Dashboard...");
      router.replace("/dashboard");
    } catch (err) {
      setError(err?.message || "Terjadi kesalahan saat memproses login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 flex items-center justify-center">
      <div className="w-full max-w-4xl rounded-[32px] border border-orange-100 bg-white shadow-2xl shadow-orange-100/40 overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Banner Samping */}
          <section className="rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-400 px-8 py-12 text-white lg:rounded-r-none lg:rounded-l-[32px] flex flex-col justify-between">
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-orange-100">PT Visitiga Media</p>
              <h1 className="text-4xl font-semibold">Absensi Karyawan</h1>
              <p className="max-w-xl text-sm leading-6 text-orange-100/90">
                Sistem E-Absensi modern berbasis foto selfie live & geofencing GPS. Silakan masuk menggunakan akun resmi Anda.
              </p>
            </div>

            <div className="mt-8 space-y-3 rounded-3xl bg-white/10 p-6 text-xs text-orange-100 shadow-inner">
              <p className="font-semibold text-white">Catatan Akses:</p>
              <ul className="space-y-1.5 text-orange-100/90">
                <li>• Akun Admin/Owner akan otomatis masuk ke menu Pemantauan.</li>
                <li>• Akun Karyawan masuk ke menu Selfie Absen & Riwayat Pribadi.</li>
                <li>• Riwayat absensi bersifat privat dan terenkripsi.</li>
              </ul>
            </div>
          </section>

          {/* Form Login */}
          <section className="p-8 lg:p-10 flex flex-col justify-center">
            <h2 className="text-2xl font-semibold text-slate-900">Masuk ke Sistem</h2>
            <p className="mt-1 text-sm text-slate-500">
              Gunakan email kantor dan password terdaftar.
            </p>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700">Ambil Foto untuk Login</p>
                <div className="mt-2 flex items-start gap-4">
                  <div>
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/png"
                      className="rounded-xl border border-slate-200"
                      videoConstraints={{ facingMode: "user" }}
                    />
                  </div>
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={capturePhotoAndCheckLocation}
                      className="rounded-2xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Ambil Foto & Cek Lokasi
                    </button>

                    {photoPreview && (
                      <div className="mt-3">
                        <img src={photoPreview} alt="Preview" className="w-48 rounded-lg border" />
                        <p className="mt-2 text-sm text-slate-600">{geoCheckMessage}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Email Kantor
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={loading || checkingSession}
                  placeholder="nama@visitiga.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Kata Sandi
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={loading || checkingSession}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-500"
                  >
                    {showLoginPassword ? "Sembunyikan" : "Lihat"}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </p>
              )}
              {message && (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || checkingSession}
                className="w-full rounded-2xl bg-orange-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300 shadow-lg shadow-orange-600/20"
              >
                {checkingSession 
                  ? "Memeriksa Sesi..." 
                  : loading 
                  ? "Memverifikasi..." 
                  : "Masuk Sekarang"
                }
              </button>
            </form>


            <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50/60 p-4 text-xs text-slate-600">
              <p className="font-semibold text-orange-800">Bantuan Login?</p>
              <p className="mt-1 text-slate-600">
                Pendaftaran akun karyawan hanya dapat dilakukan oleh admin. Jika Anda belum punya akun, minta admin/IT untuk membuatkannya.
              </p>
              <p className="mt-3 text-slate-600 font-semibold">Login admin contoh:</p>
              <p className="text-slate-600">Email: admin@visitiga.com</p>
              <p className="text-slate-600">Password: Admin123!</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}