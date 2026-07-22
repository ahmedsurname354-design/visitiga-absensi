const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const lines = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/);
const env = {};
for (const line of lines) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const [k, ...rest] = line.split('=');
  env[k] = rest.join('=');
}

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, detectSessionInUrl: false },
});

(async () => {
  const { data, error } = await client.auth.signInWithPassword({
    email: 'admin@visitiga.com',
    password: 'Admin123!',
  });

  console.log('ERR:' + (error ? error.message : 'null'));
  console.log('USER:' + (data && data.user ? data.user.email : 'null'));
  console.log('SESSION:' + (data && data.session ? true : false));
})();
