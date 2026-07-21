"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function IzinPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [type, setType] = useState("Sakit");
  const [requestedDate, setRequestedDate] = useState("");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function getSession() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user?.id) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", session.user.id)
        .single();

      if (profileError || !profileData) {
        router.replace("/login");
        return;
      }

      setProfile(profileData);
    }

    getSession();
  }, [router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!requestedDate) {
      setError("Pilih tanggal pengajuan.");
      return;
    }

    setLoading(true);

    try {
      let fileUrl = null;
      if (attachment) {
        const fileName = `izin/${profile.id}/${Date.now()}-${attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from("izin")
          .upload(fileName, attachment, { contentType: attachment.type });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage.from("izin").getPublicUrl(fileName);
        fileUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase.from("permissions").insert({
        user_id: profile.id,
        user_name: profile.name,
        type,
        requested_date: requestedDate,
        note,
        hours: type === "Lembur" ? Number(hours) || 0 : null,
        file_url: fileUrl,
        status: "Pending",
      });

      if (insertError) {
        throw insertError;
      }

      setMessage("Pengajuan izin berhasil dikirim. Tunggu persetujuan admin.");
      setRequestedDate("");
      setNote("");
      setHours("");
      setAttachment(null);
    } catch (err) {
      setError(err?.message || "Gagal mengirim pengajuan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-orange-600">Pengajuan Izin</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Formulir Sakit / Izin / Lembur</h1>
              <p className="mt-2 text-sm text-slate-600">
                Ajukan izin, sakit, atau lembur langsung dari sistem absensi Visitiga.
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

        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Jenis Pengajuan</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                >
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                  <option value="Lembur">Lembur</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tanggal</span>
                <input
                  type="date"
                  value={requestedDate}
                  onChange={(event) => setRequestedDate(event.target.value)}
                  required
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </label>
            </div>

            {type === "Lembur" ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Jam Lembur (dalam jam)</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="Contoh: 2"
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Keterangan</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows="4"
                placeholder="Deskripsikan alasan izin atau rincian lembur"
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Upload Surat / Bukti</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(event) => setAttachment(event.target.files?.[0] || null)}
                className="mt-2 w-full text-sm text-slate-700"
              />
            </label>

            {error ? <p className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-orange-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
            >
              {loading ? "Mengirim..." : "Ajukan Pengajuan"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
