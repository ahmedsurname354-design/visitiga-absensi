const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).reduce((acc, line) => {
  if (!line || line.startsWith('#')) return acc;
  const [key, ...rest] = line.split('=');
  acc[key] = rest.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, detectSessionInUrl: false },
});

(async () => {
  const testEmail = 'rafli@visitiga.com';
  const testPassword = 'rafli123';

  console.log('Testing login for', testEmail);

  const signIn = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  console.log('signIn error:', signIn.error ? signIn.error.message : null);
  console.log('signIn user id:', signIn.data?.user?.id);
  console.log('signIn session:', !!signIn.data?.session);

  const userId = signIn.data?.user?.id;
  if (userId) {
    const profileById = await supabase.from('profiles').select('id,email,name,role').eq('id', userId);
    console.log('profileById error:', profileById.error ? profileById.error.message : null);
    console.log('profileById data:', JSON.stringify(profileById.data, null, 2));
  }

  const profileByEmail = await supabase.from('profiles').select('id,email,name,role').eq('email', testEmail);
  console.log('profileByEmail error:', profileByEmail.error ? profileByEmail.error.message : null);
  console.log('profileByEmail data:', JSON.stringify(profileByEmail.data, null, 2));
})();
