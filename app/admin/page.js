"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [filters, setFilters] = useState({ userId: "all", month: "all", year: "all" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      if (profileData.role !== "admin") {
        router.replace("/login");
        return;
      }

      setProfile(profileData);
    }

    getSession();
  }, [router]);

  useEffect(() => {
    if (!profile) return;
    loadData();
  }, [profile]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [attendanceResponse, employeesResponse, permissionsResponse] = await Promise.all([
        supabase.from("attendance").select("*").order("check_in_time", { ascending: false }),
        supabase.from("profiles").select("id, name, email").order("name", { ascending: true }),
        supabase.from("permissions").select("*").order("requested_date", { ascending: false }),
      ]);

      if (attendanceResponse.error || employeesResponse.error || permissionsResponse.error) {
        throw new Error("Gagal memuat data admin.");
      }

      setAttendance(attendanceResponse.data || []);
      setEmployees(employeesResponse.data || []);
      setPermissions(permissionsResponse.data || []);
    } catch (err) {
      setError(err?.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  }

  const filteredAttendance = useMemo(() => {
    return attendance.filter((item) => {
      const date = item.check_in_time ? new Date(item.check_in_time) : null;
      if (!date) return false;
      if (filters.userId !== "all" && item.user_id !== filters.userId) {
        return false;
      }
      if (filters.month !== "all" && date.getMonth() + 1 !== Number(filters.month)) {
        return false;
      }
      if (filters.year !== "all" && date.getFullYear() !== Number(filters.year)) {
        return false;
      }
      return true;
    });
  }, [attendance, filters]);

  const summary = useMemo(() => {
    const totalMasuk = attendance.length;
    const terlambat = attendance.filter((item) => item.status === "Terlambat").length;
    const izin = permissions.filter((item) => ["Izin", "Sakit"].includes(item.type)).length;
    return { totalMasuk, terlambat, izin };
  }, [attendance, permissions]);

  const years = useMemo(() => {
    const yearSet = new Set();
    attendance.forEach((item) => {
      if (item.check_in_time) {
        yearSet.add(new Date(item.check_in_time).getFullYear());
      }
    });
    const currentYear = new Date().getFullYear();
    yearSet.add(currentYear);
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [attendance]);

  function formatDate(value) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  async function exportExcel() {
    const rows = filteredAttendance.map((row) => ({
      Nama: row.user_name,
      Email: row.user_email || "-",
      Tanggal: formatDate(row.check_in_time),
      Status: row.status,
      Jarak: `${row.distance} m`,
      Latitude: row.latitude,
      Longitude: row.longitude,
      "Link Selfie": row.image_url || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Absensi");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekap-absensi-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-orange-600">Panel Owner / Admin</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Rekap Absensi</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Tampilan ringkasan absensi, izin, dan data riwayat karyawan PT Visitiga Media.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Logout Admin
            </button>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-orange-100 bg-orange-50 p-6 shadow-sm">
            <p className="text-sm text-slate-600">Total Masuk</p>
            <p className="mt-4 text-4xl font-semibold text-slate-900">{summary.totalMasuk}</p>
          </div>
          <div className="rounded-3xl border border-orange-100 bg-slate-50 p-6 shadow-sm">
            <p className="text-sm text-slate-600">Terlambat</p>
            <p className="mt-4 text-4xl font-semibold text-orange-600">{summary.terlambat}</p>
          </div>
          <div className="rounded-3xl border border-orange-100 bg-slate-50 p-6 shadow-sm">
            <p className="text-sm text-slate-600">Total Izin</p>
            <p className="mt-4 text-4xl font-semibold text-slate-900">{summary.izin}</p>
          </div>
        </section>

        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Filter Riwayat</h2>
              <p className="mt-1 text-sm text-slate-600">Pilih karyawan dan periode bulan/tahun.</p>
            </div>
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading}
              className="rounded-3xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
            >
              Export Excel
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Karyawan</span>
              <select
                value={filters.userId}
                onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Karyawan</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Bulan</span>
              <select
                value={filters.month}
                onChange={(event) => setFilters((prev) => ({ ...prev, month: event.target.value }))}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Bulan</option>
                {[...Array(12)].map((_, index) => (
                  <option key={index} value={String(index + 1).padStart(2, "0")}>
                    {new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2024, index))}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Tahun</span>
              <select
                value={filters.year}
                onChange={(event) => setFilters((prev) => ({ ...prev, year: event.target.value }))}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Tahun</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <h2 className="text-2xl font-semibold text-slate-900">Detail Riwayat Karyawan</h2>
          <p className="mt-2 text-sm text-slate-600">Foto selfie, jam masuk, dan alamat GPS setiap karyawan.</p>

          {error ? <p className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-500">Karyawan</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Masuk</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Pulang</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500">GPS</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Foto Selfie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                      Data absensi tidak ditemukan untuk filter saat ini.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-900">{row.user_name}</td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(row.check_in_time)}</td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(row.check_in_time)}</td>
                      <td className="px-4 py-4 text-slate-600">{row.check_out_time ? formatDate(row.check_out_time) : "-"}</td>
                      <td className="px-4 py-4 text-orange-700">{row.status}</td>
                      <td className="px-4 py-4 text-slate-600">{row.latitude?.toFixed(5)}, {row.longitude?.toFixed(5)}</td>
                      <td className="px-4 py-4">
                        {row.image_url ? (
                          <a href={row.image_url} target="_blank" rel="noreferrer" className="text-orange-600 underline">
                            Lihat Foto
                          </a>
                        ) : (
                          <span className="text-slate-400">Tidak ada</span>
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
