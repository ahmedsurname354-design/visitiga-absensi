"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Webcam from "react-webcam";
import { supabase } from "@/lib/supabase";
import { isWithinOfficeRadius } from "@/lib/geofence";

export default function DashboardPage() {
  const router = useRouter();
  const webcamRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [geoMessage, setGeoMessage] = useState("Menunggu izin lokasi...");
  const [gpsStatus, setGpsStatus] = useState({ distance: null, isInside: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [location, setLocation] = useState({ latitude: null, longitude: null });

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, role, email")
        .eq("id", session.user.id)
        .single();

      if (profileError || !profileData) {
        router.replace("/login");
        return;
      }

      if (profileData.role === "admin") {
        router.replace("/admin");
        return;
      }

      setProfile(profileData);
    }

    loadSession();
  }, [router]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    requestGeolocation();
    loadAttendance();
  }, [profile]);

  async function loadAttendance() {
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

  function requestGeolocation() {
    if (!navigator.geolocation) {
      setGeoMessage("Perangkat tidak mendukung GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const result = isWithinOfficeRadius(latitude, longitude);
        setLocation({ latitude, longitude });
        setGpsStatus(result);
        setGeoMessage(
          result.isInside ? "Anda berada di dalam radius kantor." : "Anda berada di luar radius kantor."
        );
      },
      () => {
        setGeoMessage("Gagal mendapatkan lokasi. Pastikan GPS aktif.");
      },
      { enableHighAccuracy: true }
    );
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function attendanceStatus(checkInTime) {
    const date = new Date(checkInTime);
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeValue = hour * 60 + minute;
    return timeValue > 8 * 60 + 15 ? "Terlambat" : "Masuk Tepat Waktu";
  }

  async function handleCheckIn() {
    setMessage("");
    setError("");

    if (!gpsStatus.isInside) {
      setError("Anda berada di luar radius 200 meter dari kantor. Absen diblokir.");
      return;
    }

    const screenshot = webcamRef.current?.getScreenshot({ width: 720, height: 720 });
    if (!screenshot) {
      setError("Gagal mengambil foto selfie. Pastikan kamera aktif.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(screenshot);
      const blob = await response.blob();
      const fileName = `absensi/${profile.id}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("selfies")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from("selfies").getPublicUrl(fileName);
      const imageUrl = publicUrlData.publicUrl;
      const status = attendanceStatus(new Date().toISOString());

      const { error: insertError } = await supabase.from("attendance").insert({
        user_id: profile.id,
        user_name: profile.name,
        user_email: profile.email,
        check_in_time: new Date().toISOString(),
        status,
        latitude: location.latitude,
        longitude: location.longitude,
        distance: Math.round(gpsStatus.distance),
        image_url: imageUrl,
      });

      if (insertError) {
        throw insertError;
      }

      setMessage("Absensi berhasil dikirim. Terima kasih.");
      await loadAttendance();
    } catch (err) {
      setError(err?.message || "Terjadi kesalahan saat absensi.");
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
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-orange-600">PT Visitiga Media</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Dashboard Absensi Karyawan</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Sistem absensi berbasis selfie dan geofence. Hanya riwayat Anda sendiri yang dapat dilihat.
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
              <p className="text-sm text-slate-600">Nama</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{profile?.name || "-"}</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Status GPS</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{geoMessage}</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Jarak ke kantor</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{gpsStatus.distance !== null ? `${Math.round(gpsStatus.distance)} m` : "-"}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Selfie Absensi</h2>
                <p className="mt-1 text-sm text-slate-600">Ambil foto selfie langsung dari kamera untuk mencatat hadir.</p>
              </div>
              <span className="rounded-full bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700">{gpsStatus.isInside ? "Di dalam kantor" : "Diluar kantor"}</span>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <Webcam
                audio={false}
                mirrored
                ref={webcamRef}
                screenshotFormat="image/png"
                className="h-[360px] w-full rounded-3xl object-cover"
                videoConstraints={{ facingMode: "user" }}
              />
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={busy || !gpsStatus.isInside}
                className="inline-flex items-center justify-center rounded-3xl bg-orange-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
              >
                {busy ? "Mengirim absensi..." : "Absen Masuk"}
              </button>
              <button
                type="button"
                onClick={requestGeolocation}
                className="rounded-3xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
              >
                Perbarui Lokasi
              </button>
            </div>

            {message ? <p className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-8 rounded-3xl border border-orange-100 bg-orange-50 p-5 text-sm text-slate-700">
              <p className="font-semibold">Catatan</p>
              <p className="mt-2">Tombol absen terkunci jika Anda berada lebih dari 200 meter dari lokasi kantor.</p>
            </div>
          </div>

          <div className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <h2 className="text-2xl font-semibold text-slate-900">Riwayat Absensi</h2>
            <p className="mt-2 text-sm text-slate-600">Daftar absensi Anda sendiri, tanpa kemampuan edit.</p>

            <div className="mt-6 space-y-4">
              {attendance.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                  Belum ada riwayat absensi. Silakan lakukan absen masuk pertama.
                </div>
              ) : (
                attendance.map((row) => (
                  <div key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Tanggal & waktu</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">{formatDate(row.check_in_time)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">Status</p>
                        <p className="mt-1 text-lg font-semibold text-orange-600">{row.status}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Jarak</p>
                        <p className="mt-2 text-base font-semibold text-slate-900">{row.distance} m</p>
                      </div>
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Latitude</p>
                        <p className="mt-2 text-base font-semibold text-slate-900">{row.latitude?.toFixed(5) || "-"}</p>
                      </div>
                      <div className="rounded-3xl bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Longitude</p>
                        <p className="mt-2 text-base font-semibold text-slate-900">{row.longitude?.toFixed(5) || "-"}</p>
                      </div>
                    </div>
                    {row.image_url ? (
                      <img src={row.image_url} alt="Selfie absensi" className="mt-4 w-full rounded-3xl border border-slate-200 object-cover" />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {lastAttendance ? (
          <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
            <h2 className="text-2xl font-semibold text-slate-900">Absensi Terakhir</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Waktu masuk</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(lastAttendance.check_in_time)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Status</p>
                <p className="mt-2 text-lg font-semibold text-orange-600">{lastAttendance.status}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm text-slate-500">Lokasi</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{gpsStatus.isInside ? "Di dalam kantor" : "Di luar kantor"}</p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
