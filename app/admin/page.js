"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeePassword, setNewEmployeePassword] = useState("");
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [employeeError, setEmployeeError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  function normalizeRole(role) {
    if (!role) return null;
    const normalized = role.toString().toLowerCase().trim();
    if (normalized === "karyawan") return "employee";
    return normalized;
  }

  // Load Session & Verifikasi Role Admin
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
        };

        if (userProfile.role !== "admin") {
          router.replace("/dashboard");
          return;
        }

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

  // Load Data Absensi, Karyawan, & Izin
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [attendanceResponse, employeesResponse, permissionsResponse] = await Promise.all([
        supabase.from("attendance").select("*").order("check_in_time", { ascending: false }),
        supabase.from("profiles").select("id, name, email").order("name", { ascending: true }),
        supabase.from("permissions").select("*").order("requested_date", { ascending: false }),
      ]);

      if (attendanceResponse.error) throw attendanceResponse.error;

      setAttendance(attendanceResponse.data || []);
      setEmployees(employeesResponse.data || []);
      setPermissions(permissionsResponse.data || []);
    } catch (err) {
      console.error("Load data error:", err);
      setError(err?.message || "Gagal memuat data dari database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile) loadData();
  }, [profile, loadData]);

  // Filter Data Absensi
  const filteredAttendance = useMemo(() => {
    return attendance.filter((item) => {
      if (!item.check_in_time) return false;
      const date = new Date(item.check_in_time);

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

  // Ringkasan Statistik Berdasarkan Filter yang Aktif
  const summary = useMemo(() => {
    const totalMasuk = filteredAttendance.length;
    const terlambat = filteredAttendance.filter((item) => item.status === "Terlambat").length;
    const izin = permissions.filter((item) => {
      if (filters.userId !== "all" && item.user_id !== filters.userId) return false;
      return ["Izin", "Sakit"].includes(item.type);
    }).length;

    return { totalMasuk, terlambat, izin };
  }, [filteredAttendance, permissions, filters.userId]);

  // Daftar Tahun Otomatis dari Data Absensi
  const years = useMemo(() => {
    const yearSet = new Set();
    attendance.forEach((item) => {
      if (item.check_in_time) {
        yearSet.add(new Date(item.check_in_time).getFullYear());
      }
    });
    yearSet.add(new Date().getFullYear());
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [attendance]);

  // Helper Format Tanggal & Jam (WIB)
  function formatDateOnly(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  }

  function formatTimeOnly(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value));
  }

  // Logout Admin Aman
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleCreateEmployee(event) {
    event.preventDefault();
    setEmployeeError("");
    setEmployeeMessage("");
    setCreatingEmployee(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error("Token admin tidak ditemukan.");
      }

      const response = await fetch("/api/register-employee", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newEmployeeName,
          email: newEmployeeEmail,
          password: newEmployeePassword,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Gagal membuat akun karyawan.");
      }

      setEmployeeMessage(result?.message || "Akun karyawan berhasil dibuat.");
      setNewEmployeeName("");
      setNewEmployeeEmail("");
      setNewEmployeePassword("");
      setShowNewPassword(false);
      loadData();
    } catch (err) {
      setEmployeeError(err?.message || "Terjadi kesalahan saat membuat akun karyawan.");
    } finally {
      setCreatingEmployee(false);
    }
  }

  // Export Rekap ke File Excel (.xlsx)
  function exportExcel() {
    if (filteredAttendance.length === 0) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }

    const rows = filteredAttendance.map((row) => ({
      "Nama Karyawan": row.user_name || "-",
      Email: row.user_email || "-",
      Tanggal: formatDateOnly(row.check_in_time),
      "Jam Masuk": formatTimeOnly(row.check_in_time),
      "Jam Pulang": formatTimeOnly(row.check_out_time),
      Status: row.status,
      "Jarak (Meter)": row.distance ? `${row.distance} m` : "-",
      Latitude: row.latitude || "-",
      Longitude: row.longitude || "-",
      "Link Foto Selfie": row.image_url || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Absensi");
    
    // Auto-fit Column Width
    const max_width = rows.reduce((w, r) => Math.max(w, (r["Nama Karyawan"] || "").length), 10);
    worksheet["!cols"] = [{ wch: max_width + 5 }];

    XLSX.writeFile(workbook, `rekap-absensi-visitiga-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header Admin */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-orange-600">Panel Owner / Admin</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Rekap Absensi Karyawan</h1>
              <p className="mt-1 text-sm text-slate-600">
                Pemantauan riwayat kehadiran, foto selfie, dan ekspor laporan PT Visitiga Media.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Logout Admin
            </button>
          </div>
        </section>

        {/* Card Statistik Summary */}
        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-orange-100 bg-orange-50 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Total Kehadiran</p>
            <p className="mt-3 text-4xl font-bold text-slate-900">{summary.totalMasuk}</p>
          </div>
          <div className="rounded-3xl border border-orange-100 bg-slate-50 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Terlambat</p>
            <p className="mt-3 text-4xl font-bold text-orange-600">{summary.terlambat}</p>
          </div>
          <div className="rounded-3xl border border-orange-100 bg-slate-50 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Total Izin / Sakit</p>
            <p className="mt-3 text-4xl font-bold text-slate-900">{summary.izin}</p>
          </div>
        </section>

        {/* Form Buat Karyawan Baru */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Buat Akun Karyawan Baru</h2>
              <p className="mt-1 text-sm text-slate-600">Hanya admin yang dapat membuat akun karyawan langsung aktif.</p>
            </div>
          </div>

          {employeeError && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {employeeError}
            </p>
          )}
          {employeeMessage && (
            <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
              {employeeMessage}
            </p>
          )}

          <form onSubmit={handleCreateEmployee} className="mt-6 grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Nama Lengkap</span>
              <input
                type="text"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                required
                disabled={creatingEmployee}
                placeholder="Contoh: Saifuddin"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Email</span>
              <input
                type="email"
                value={newEmployeeEmail}
                onChange={(e) => setNewEmployeeEmail(e.target.value)}
                required
                disabled={creatingEmployee}
                placeholder="nama@visitiga.com"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
              />
            </label>

            <div className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Password</span>
              <div className="relative mt-2">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newEmployeePassword}
                  onChange={(e) => setNewEmployeePassword(e.target.value)}
                  required
                  disabled={creatingEmployee}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-500"
                >
                  {showNewPassword ? "Sembunyikan" : "Lihat"}
                </button>
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={creatingEmployee}
                className="w-full rounded-3xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {creatingEmployee ? "Membuat..." : "Buat Karyawan"}
              </button>
            </div>
          </form>
        </section>

        {/* Filter Section */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Filter Data Absensi</h2>
              <p className="mt-1 text-sm text-slate-600">Pilih filter karyawan, bulan, dan tahun rekapitulasi.</p>
            </div>
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading || filteredAttendance.length === 0}
              className="rounded-3xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 shadow-md shadow-orange-600/20"
            >
              Export Excel (.xlsx)
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Pilih Karyawan</span>
              <select
                value={filters.userId}
                onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Karyawan</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name || employee.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Bulan</span>
              <select
                value={filters.month}
                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Bulan</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2026, index, 1));
                  return (
                    <option key={index} value={String(index + 1)}>
                      {monthName}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-700">Tahun</span>
              <select
                value={filters.year}
                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
              >
                <option value="all">Semua Tahun</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Tabel Detail Riwayat */}
        <section className="rounded-[32px] border border-orange-100 bg-white p-8 shadow-lg shadow-orange-100/40">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Detail Riwayat Kehadiran</h2>
              <p className="mt-1 text-sm text-slate-600">Daftar lengkap foto selfie live, koordinat GPS, dan status masuk.</p>
            </div>
            {loading && <span className="text-sm font-medium text-orange-600">Memuat data...</span>}
          </div>

          {error && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 space-y-4">
            {filteredAttendance.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Data absensi tidak ditemukan untuk filter ini.
              </div>
            ) : (
              Object.entries(
                filteredAttendance.reduce((acc, item) => {
                  const userId = item.user_id || item.user_email || "unknown";
                  const dateKey = new Date(item.check_in_time).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
                  acc[userId] = acc[userId] || {};
                  acc[userId][dateKey] = acc[userId][dateKey] || [];
                  acc[userId][dateKey].push(item);
                  return acc;
                }, {})
              ).map(([userId, dates]) => {
                const user = employees.find((e) => e.id === userId) || { name: (filteredAttendance.find(r => (r.user_id===userId))?.user_name) || userId };
                return (
                  <div key={userId} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900">{user.name || userId}</h3>
                      <p className="text-sm text-slate-500">{Object.keys(dates).length} hari</p>
                    </div>

                    <div className="mt-3 space-y-3">
                      {Object.entries(dates).sort((a,b)=> b[0].localeCompare(a[0])).map(([dateKey, rows]) => (
                        <div key={dateKey} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <strong className="text-sm text-slate-700">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(dateKey))}</strong>
                            <span className="text-xs text-slate-500">{rows.length} record</span>
                          </div>

                          <div className="mt-2 grid gap-2">
                            {rows.map((row) => (
                              <div key={row.id} className="flex items-center justify-between gap-4 rounded-xl bg-white p-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">{formatTimeOnly(row.check_in_time)} — {row.status}</div>
                                  <div className="text-xs text-slate-500">Jarak: {row.distance || 0} m • {row.latitude?.toFixed(4) || '-'}, {row.longitude?.toFixed(4) || '-'}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-xs text-slate-500 mr-2">{formatTimeOnly(row.check_out_time)}</div>
                                  {row.image_url ? (
                                    <a href={row.image_url} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">Lihat Foto</a>
                                  ) : (
                                    <span className="text-xs text-slate-400">No Photo</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}