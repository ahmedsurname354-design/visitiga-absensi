const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  throw new Error('.env.local file not found');
}

const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return acc;
  const [key, ...rest] = line.split('=');
  acc[key] = rest.join('=').trim();
  return acc;
}, {});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Please define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: false,
  },
});

(async () => {
  const email = 'admin@visitigamedia.com';
  const password = 'admin321';
  const name = 'Admin Visitiga Media';

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'admin',
      name,
    },
    app_metadata: {
      role: 'admin',
    },
  });

  if (error) {
    console.error('Error creating admin user:', error.message || error);
    process.exit(1);
  }

  const userId = data?.user?.id;
  console.log('Admin user created:', email, 'id=', userId);

  if (userId) {
    const { error: profileError } = await client.from('profiles').upsert([
      {
        id: userId,
        email,
        name,
        role: 'admin',
      },
    ]);

    if (profileError) {
      console.error('Profile upsert error:', profileError.message || profileError);
      process.exit(1);
    }

    console.log('Admin profile upserted successfully.');
  }
})();
