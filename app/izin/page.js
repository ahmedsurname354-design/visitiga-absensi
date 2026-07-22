"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function IzinPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [type, setType] = useState("Sakit");
  const [requestedDate, setRequestedDate] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [myPermissions, setMyPermissions] = useState([]);
  
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function normalizeRole(role) {
    if (!role) return null;
    const normalized = role.toString().toLowerCase().trim();
    if (normalized === "karyawan") return "employee";
    return normalized;
  }

  // Load Session User
  useEffect(() => {
    let isMounted = true;

    async function getSession() {
      try {
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

        if (isMounted) setProfile(userProfile);
      } catch (err) {
        console.error("Session check error:", err);
        router.replace("/login");
      }
    }

    getSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  // Load Riwayat Pengajuan Izin Saya
  const loadMyPermissions = useCallback(async () => {
    if (!profile?.id) return;

    const { data, error: fetchErr } = await supabase
      .from("permissions")
      .select("*")
      .eq("user_id", profile.id)
      .order("requested_date", { ascending: false });

    if (!fetchErr) {
      setMyPermissions(data || []);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) loadMyPermissions();
  }, [profile, loadMyPermissions]);

  // Format Tanggal
  function formatDateOnly(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!requestedDate) {
      setError("Pilih tanggal pengajuan terlebih dahulu.");
      return;
    }

    if (type === "Lembur" && (!hours || Number(hours) <= 0)) {
      setError("Masukkan jumlah jam lembur yang valid.");
      return;
    }

    setLoading(true);

    try {
      let fileUrl = null;

      // Upload File jika ada
      if (attachment) {
        const cleanFileName = attachment.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const filePath = `izin/${profile.id}/${Date.now()}-${cleanFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("izin")
          .upload(filePath, attachment, { 
            contentType: attachment.type,
            upsert: true 
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("izin")
          .getPublicUrl(filePath);
        
        fileUrl = publicUrlData.publicUrl;
      }

      // Insert Data ke Supabase
      const { error: insertError } = await supabase.from("permissions").insert({
        user_id: profile.id,
        user_name: profile.name,
        type,
        requested_date: requestedDate,
        note: note || "-",
        hours: type === "Lembur" ? Number(hours) || 0 : null,
        file_url: fileUrl,
        status: "Pending",
      });

      if (insertError) throw insertError;

      setMessage("✅ Pengajuan izin berhasil dikirim. Tunggu persetujuan Admin.");
      
      // Reset Form State
      setRequestedDate("");
      setNote("");
      setHours("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      await loadMyPermissions();
    } catch (err) {
      console.error("Submit error:", err);
      setError(err?.message || "Gagal mengirim pengajuan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header Panel */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-orange-600">Formulir Karyawan</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Pengajuan Sakit / Izin / Lembur</h1>
              <p className="mt-1 text-sm text-slate-600">
                Kirim permohonan izin atau permohonan lembur ke Admin/Owner.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="rounded-3xl border border-slate-200 bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              Kembali ke Dashboard
            </button>
          </div>
        </section>

        {/* Form Pengajuan */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-700">Jenis Pengajuan</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
                >
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                  <option value="Lembur">Lembur</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-700">Tanggal Pengajuan</span>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(event) => setRequestedDate(event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
              </label>
            </div>

            {type === "Lembur" && (
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-700">Jumlah Jam Lembur</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="Contoh: 2"
                  required
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Keterangan / Alasan</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows="3"
                placeholder="Deskripsikan alasan izin atau rincian pekerjaan lembur..."
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Upload Lampiran / Surat Dokter (Opsional)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                className="mt-2 w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-100 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-orange-700 hover:file:bg-orange-200"
              />
            </label>

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
              disabled={loading}
              className="w-full rounded-2xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300 shadow-md shadow-orange-600/20"
            >
              {loading ? "Mengirim..." : "Kirim Pengajuan"}
            </button>
          </form>
        </section>

        {/* Tabel Riwayat Pengajuan Saya */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <h2 className="text-xl font-semibold text-slate-900">Riwayat Pengajuan Saya</h2>
          <p className="mt-1 text-sm text-slate-600">Daftar permohonan izin dan lembur yang pernah Anda ajukan.</p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Tipe</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Tanggal</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Keterangan</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Lampiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {myPermissions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-6 text-center text-xs text-slate-500">
                      Belum ada riwayat pengajuan izin/lembur.
                    </td>
                  </tr>
                ) : (
                  myPermissions.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.type} {row.hours ? `(${row.hours} jam)` : ""}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateOnly(row.requested_date)}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{row.note}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                          row.status === "Approved" || row.status === "Disetujui"
                            ? "bg-emerald-100 text-emerald-700"
                            : row.status === "Rejected" || row.status === "Ditolak"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.file_url ? (
                          <a
                            href={row.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-orange-600 hover:underline"
                          >
                            Lihat File
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}