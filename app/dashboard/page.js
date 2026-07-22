"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { isWithinOfficeRadius } from "@/lib/geofence";

export default function DashboardPage() {
  const router = useRouter();
  const webcamRef = useRef(null);
  const watchIdRef = useRef(null); // Ref untuk menyimpan ID watchPosition

  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [geoMessage, setGeoMessage] = useState("Menunggu izin lokasi...");
  const [gpsStatus, setGpsStatus] = useState({ distance: null, isInside: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [location, setLocation] = useState({ latitude: null, longitude: null });

  function normalizeRole(role) {
    if (!role) return null;
    const normalized = role.toString().toLowerCase();
    if (normalized === "karyawan") return "employee";
    return normalized;
  }

  // Load Session User
  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, name, role, email")
        .eq("id", session.user.id)
        .maybeSingle();

      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("id, name, role, email")
        .eq("email", session.user.email)
        .maybeSingle();

      const metadata = session.user.user_metadata || {};
      const rawRole = profileData?.role || profileByEmail?.role || metadata.role || "employee";
      const role = normalizeRole(rawRole) || "employee";
      const userProfile = profileData || profileByEmail || {
        id: session.user.id,
        name: metadata.name || session.user.email,
        role,
        email: session.user.email,
      };

      if (userProfile.role === "admin") {
        router.replace("/admin");
        return;
      }

      setProfile(userProfile);
    }

    loadSession();
  }, [router]);

  // Request GPS & Load Attendance ketika profile siap
  useEffect(() => {
    if (!profile) return;
    requestGeolocation();
    loadAttendance();

    // Cleanup watchPosition saat komponen di-unmount
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [profile]);

  async function loadAttendance() {
    if (!profile?.id) return;
    const { data, error: attendanceError } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", profile.id)
      .order("check_in_time", { ascending: false });

    if (attendanceError) {
      setError("Gagal memuat riwayat absensi.");
      return;
    }

    setAttendance(data || []);
  }

  // FUNGSI PERBAIKAN GEOLOCATION (Menggunakan watchPosition + High Accuracy)
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoMessage("Perangkat tidak mendukung GPS.");
      return;
    }

    // Bersihkan listener GPS yang lama jika ada
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setGeoMessage("Mengkunci sinyal GPS presisi... Mohon tunggu sebentar.");

    const options = {
      enableHighAccuracy: true, // Wajib paksa GPS hardware
      timeout: 20000,           // Beri waktu 20 detik untuk mendapat sinyal presisi
      maximumAge: 0,            // Jangan gunakan cache lokasi lama
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const result = isWithinOfficeRadius(latitude, longitude);

        setLocation({ latitude, longitude });
        setGpsStatus(result);

        // Jika akurasi sudah tergolong sangat presisi (<= 30 meter), hentikan pencarian lokasi
        if (accuracy <= 30) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        setGeoMessage(
          result.isInside
            ? `Lokasi Terkunci (Akurasi GPS: ~${Math.round(accuracy)}m). Anda berada di dalam radius kantor.`
            : `Akurasi GPS: ~${Math.round(accuracy)}m. Anda di luar radius kantor (Maks 200m). Jarak terdeteksi: ${Math.round(result.distance)} m`
        );
      },
      (err) => {
        console.error("GPS Error:", err);
        setGeoMessage("Gagal mendapatkan lokasi. Pastikan GPS/Wi-Fi aktif dan izinkan lokasi di browser.");
      },
      options
    );

    // Timeout pengaman: Hentikan melacak setelah 15 detik untuk hemat daya
    setTimeout(() => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }, 15000);
  }, []);

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta"
    }).format(new Date(value));
  }

  function attendanceStatus(checkInTime) {
    const date = new Date(checkInTime);
    // Jam kerja WIB
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeValue = hour * 60 + minute;
    // Jam 08:15 WIB (8 * 60 + 15 = 495 menit)
    return timeValue > 495 ? "Terlambat" : "Masuk Tepat Waktu";
  }

  async function handleCheckIn() {
    setMessage("");
    setError("");

    if (!gpsStatus.isInside) {
      setError("Absen diblokir! Anda harus berada di dalam radius 200m dari kantor PT Visitiga Media.");
      return;
    }

    if (!location.latitude || !location.longitude) {
      setError("Lokasi GPS belum siap. Silakan klik 'Perbarui Lokasi GPS'.");
      return;
    }

    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setError("Gagal mengambil foto. Izinkan akses kamera pada browser Anda.");
      return;
    }

    setBusy(true);
    try {
      // Convert Base64 Screenshot to Blob Image
      const res = await fetch(screenshot);
      const blob = await res.blob();
      const fileName = `selfies/${profile.id}/${Date.now()}.png`;

      // Upload Foto ke Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("selfies")
        .upload(fileName, blob, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      // Ambil Public URL Foto
      const { data: publicUrlData } = supabase.storage
        .from("selfies")
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;
      const nowIso = new Date().toISOString();
      const status = attendanceStatus(nowIso);

      // Insert ke Database
      const { error: insertError } = await supabase.from("attendance").insert({
        user_id: profile.id,
        user_name: profile.name,
        user_email: profile.email,
        check_in_time: nowIso,
        status,
        latitude: location.latitude,
        longitude: location.longitude,
        distance: gpsStatus.distance !== null ? Math.round(gpsStatus.distance) : 0,
        image_url: imageUrl,
      });

      if (insertError) throw insertError;

      setMessage("✅ Absensi berhasil dicatat. Terima kasih!");
      await loadAttendance();
    } catch (err) {
      console.error("Checkin Error:", err);
      setError(err?.message || "Terjadi kesalahan saat menyimpan data absensi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setMessage("");
    setError("");

    // Require 17:00 or later local time
    const now = new Date();
    const localHour = now.getHours();
    if (localHour < 17) {
      setError("Absen pulang hanya dapat dilakukan setelah jam 17:00.");
      return;
    }

    if (!location.latitude || !location.longitude) {
      setError("Lokasi GPS belum siap. Silakan klik 'Perbarui Lokasi'.");
      return;
    }

    setBusy(true);
    try {
      const screenshot = webcamRef.current?.getScreenshot();
      if (!screenshot) {
        setError("Gagal mengambil foto. Izinkan akses kamera pada browser Anda.");
        setBusy(false);
        return;
      }

      const res = await fetch(screenshot);
      const blob = await res.blob();
      const fileName = `selfies/${profile.id}/checkout-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("selfies")
        .upload(fileName, blob, { contentType: "image/png", upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("selfies")
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;

      // find latest attendance row without check_out_time
      const { data: lastRow, error: fetchErr } = await supabase
        .from("attendance")
        .select("id")
        .eq("user_id", profile.id)
        .is("check_out_time", null)
        .order("check_in_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!lastRow || !lastRow.id) {
        setError("Tidak ditemukan catatan check-in yang bisa di-checkout.");
        setBusy(false);
        return;
      }

      const nowIso = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("attendance")
        .update({
          check_out_time: nowIso,
          check_out_image_url: imageUrl,
          check_out_latitude: location.latitude,
          check_out_longitude: location.longitude,
        })
        .eq("id", lastRow.id);

      if (updateError) throw updateError;

      setMessage("✅ Absensi pulang berhasil dicatat. Selamat pulang!");
      await loadAttendance();
    } catch (err) {
      console.error("Checkout Error:", err);
      setError(err?.message || "Terjadi kesalahan saat menyimpan data absensi pulang.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const lastAttendance = attendance[0];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header Profile */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.35em] text-orange-600">PT Visitiga Media</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Dashboard Absensi Karyawan</h1>
              <p className="mt-1 text-sm text-slate-600">
                Sistem absensi selfie live & geofencing radius kantor.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Keluar
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-orange-100 bg-orange-50 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Nama Karyawan</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{profile?.name || "-"}</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-slate-50 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Status GPS</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{geoMessage}</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-slate-50 p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Jarak ke Kantor</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {gpsStatus.distance !== null ? `${Math.round(gpsStatus.distance)} meter` : "-"}
              </p>
            </div>
          </div>
        </section>

        {/* Form Kamera Selfie & Geofence */}
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Selfie Absensi Live</h2>
                <p className="mt-1 text-sm text-slate-600">Ambil foto selfie langsung via kamera browser.</p>
              </div>
              <span className={`rounded-full px-4 py-2 text-xs font-bold ${
                gpsStatus.isInside ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
              }`}>
                {gpsStatus.isInside ? "Di Dalam Radius Kantor" : "Di Luar Radius Kantor"}
              </span>
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-black p-2">
              <Webcam
                audio={false}
                mirrored={true}
                ref={webcamRef}
                screenshotFormat="image/png"
                className="h-[320px] w-full rounded-2xl object-cover"
                videoConstraints={{
                  width: 720,
                  height: 720,
                  facingMode: "user",
                }}
              />
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={busy || !gpsStatus.isInside}
                className="inline-flex items-center justify-center rounded-3xl bg-orange-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? "Mengirim Data Absen..." : "Absen Masuk Sekarang"}
              </button>
              <button
                type="button"
                onClick={handleCheckOut}
                disabled={busy || !gpsStatus.isInside}
                className="inline-flex items-center justify-center rounded-3xl bg-slate-700 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? "Mengirim Data..." : "Absen Pulang (>=17:00)"}
              </button>
              <button
                type="button"
                onClick={requestGeolocation}
                className="rounded-3xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
              >
                Perbarui Lokasi GPS
              </button>
            </div>

            {message && (
              <p className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium">
                {message}
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
                {error}
              </p>
            )}

            <div className="mt-6 rounded-3xl border border-orange-100 bg-orange-50/60 p-5 text-sm text-slate-700">
              <p className="font-semibold text-orange-800">⚠️ Perhatian Security:</p>
              <p className="mt-1 text-slate-600">
                Tombol absen otomatis terkunci jika lokasi GPS Anda berada lebih dari 200 meter dari area kantor PT Visitiga Media.
              </p>
            </div>
          </div>

          {/* Riwayat Absensi Karyawan */}
          <div className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <h2 className="text-2xl font-semibold text-slate-900">Riwayat Absensi Saya</h2>
            <p className="mt-1 text-sm text-slate-600">Hanya menampilkan riwayat akun Anda (Read-Only).</p>

            <div className="mt-6 space-y-4 max-h-[580px] overflow-y-auto pr-2">
              {attendance.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Belum ada riwayat absensi. Silakan lakukan absen masuk.
                </div>
              ) : (
                attendance.map((row) => (
                  <div key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">Waktu Absen</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">{formatDate(row.check_in_time)}</p>
                      </div>
                      <div>
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                          row.status === "Terlambat" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {row.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                      <div className="rounded-2xl bg-white p-3 border border-slate-100">
                        <p className="text-slate-400">Jarak</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{row.distance} meter</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3 border border-slate-100">
                        <p className="text-slate-400">Lat</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{row.latitude?.toFixed(4) || "-"}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-3 border border-slate-100">
                        <p className="text-slate-400">Long</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{row.longitude?.toFixed(4) || "-"}</p>
                      </div>
                    </div>

                    {row.image_url && (
                      <img
                        src={row.image_url}
                        alt="Selfie Absensi"
                        className="mt-3 h-32 w-full rounded-2xl border border-slate-200 object-cover"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Card Ringkasan Absen Terakhir */}
        {lastAttendance && (
          <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <h2 className="text-xl font-semibold text-slate-900">Absensi Terakhir Anda</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase">Waktu Masuk</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatDate(lastAttendance.check_in_time)}</p>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase">Status Hadir</p>
                <p className="mt-1 text-base font-semibold text-orange-600">{lastAttendance.status}</p>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase">Posisi GPS</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {lastAttendance.distance <= 200 ? "Di Dalam Kantor" : "Di Luar Kantor"}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}