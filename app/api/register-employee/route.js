import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeRole(role) {
  if (!role) return null;
  const normalized = role.toString().toLowerCase().trim();
  if (normalized === "karyawan") return "employee";
  return normalized;
}

function normalizeName(value) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

async function getAdminUser(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return null;
  }

  const user = userData.user;
  const { data: profileData } = await publicClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizeRole(profileData?.role || user.user_metadata?.role);
  if (role !== "admin") return null;
  return user;
}

export async function POST(request) {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json(
      { error: "Pendaftaran admin hanya bisa dilakukan bila SUPABASE_SERVICE_ROLE_KEY tersedia di environment." },
      { status: 500 }
    );
  }

  const adminUser = await getAdminUser(request);
  if (!adminUser) {
    return Response.json(
      { error: "Akses ditolak. Hanya admin yang bisa membuat akun karyawan." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const payload = await request.json();
    const name = normalizeName(payload?.name);
    const email = (payload?.email || "").trim().toLowerCase();
    const password = payload?.password || "";

    if (!name || !email || !password) {
      return Response.json(
        { error: "Nama, email, dan password wajib diisi." },
        { status: 400 }
      );
    }

    if (name.length < 2) {
      return Response.json(
        { error: "Nama minimal 2 karakter." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    const { data: existingNameData, error: existingNameError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("name", name)
      .limit(1);

    if (existingNameError) {
      console.error("Register employee name check error:", existingNameError);
      return Response.json(
        { error: "Gagal memvalidasi nama pengguna." },
        { status: 500 }
      );
    }

    if (existingNameData?.length) {
      return Response.json(
        { error: "Nama ini sudah dipakai. Silakan pilih nama lain." },
        { status: 409 }
      );
    }

    const { data: createUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "employee",
        name,
      },
      app_metadata: {
        role: "employee",
      },
    });

    if (createUserError) {
      if (createUserError.message?.toLowerCase().includes("already registered")) {
        return Response.json(
          { error: "Email ini sudah terdaftar." },
          { status: 409 }
        );
      }

      return Response.json(
        { error: createUserError.message || "Gagal membuat akun karyawan." },
        { status: 500 }
      );
    }

    const userId = createUserData?.user?.id;
    if (!userId) {
      return Response.json(
        { error: "Akun berhasil dibuat tetapi ID pengguna tidak ditemukan." },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert([
      {
        id: userId,
        email,
        name,
        role: "employee",
      },
    ]);

    if (profileError) {
      console.error("Register employee profile insert error:", profileError);
      return Response.json(
        { error: "Akun berhasil dibuat, tetapi gagal menambahkan profil karyawan." },
        { status: 500 }
      );
    }

    return Response.json(
      {
        success: true,
        message: "Pendaftaran karyawan berhasil. Anda bisa login sekarang.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register employee route error:", error);
    return Response.json(
      { error: error?.message || "Terjadi kesalahan saat mendaftar karyawan." },
      { status: 500 }
    );
  }
}
