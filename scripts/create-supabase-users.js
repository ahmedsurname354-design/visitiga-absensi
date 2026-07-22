const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=').trim();
  });
  return env;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local file not found');
  }

  const env = loadEnv(envPath);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing in .env.local');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const accounts = [
    {
      email: 'admin@visitiga.com',
      password: 'Admin123!',
      name: 'Admin Visitiga',
      role: 'admin',
    },
    {
      email: 'karyawan1@visitiga.com',
      password: 'Karyawan1!',
      name: 'Karyawan Satu',
      role: 'employee',
    },
    {
      email: 'karyawan2@visitiga.com',
      password: 'Karyawan2!',
      name: 'Karyawan Dua',
      role: 'employee',
    },
  ];

  for (const account of accounts) {
    console.log(`\n--- Processing ${account.email} ---`);

    let userId = null;
    let session = null;

    try {
      const signUpResponse = await supabase.auth.signUp({
        email: account.email,
        password: account.password,
        options: {
          data: {
            name: account.name,
            role: account.role,
          },
        },
      });

      if (signUpResponse.error) {
        console.log(`Signup error: ${signUpResponse.error.message}`);
        const signInResponse = await supabase.auth.signInWithPassword({
          email: account.email,
          password: account.password,
        });

        if (signInResponse.error) {
          console.log('Sign in error:', signInResponse.error.message);
        } else {
          console.log('Signed in existing user.');
          session = signInResponse.data?.session;
          userId = signInResponse.data?.user?.id;
        }
      } else {
        console.log('Signup success:', signUpResponse.data.user?.id || 'no user id');
        session = signUpResponse.data?.session;
        userId = signUpResponse.data?.user?.id;
      }
    } catch (err) {
      console.log('Unexpected auth error:', err.message || err);
    }

    if (!session) {
      if (!userId) {
        console.log('No session or user ID available; skipping profile row insertion.');
      } else {
        console.log('No session available but user ID exists; skipping profile insert.');
      }
    } else {
      try {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });

        const { data, error } = await supabase.from('profiles').insert([
          {
            id: userId,
            name: account.name,
            role: account.role,
            email: account.email,
          },
        ]);

        if (error) {
          console.log('Profile insert error:', error.message);
        } else {
          console.log('Profile insert success', data);
        }
      } catch (err) {
        console.log('Unexpected profile insert error:', err.message || err);
      }
    }

    console.log('Waiting 14 seconds before next account to avoid rate limits...');
    await wait(14000);
  }

  console.log('\nDone. The accounts are:');
  accounts.forEach((account) => {
    console.log(`- ${account.role.toUpperCase()}: ${account.email} / ${account.password}`);
  });
})();
