import { supabase } from './supabaseClient.js';

export async function signUp(email, password, fullName, phone, role = 'student') {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, role }
    }
  });
}

export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    if (authError) console.error('Auth getUser error:', authError);
    return null;
  }

  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    
    if (data) {
      return data;
    }

    if (error) {
      console.warn('Could not read profiles table (table might not exist yet or RLS blocked):', error);
    }
  } catch (err) {
    console.warn('Profiles query exception:', err);
  }

  // Fallback for authenticated users if profile table has an issue or row is missing
  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const phone = user.user_metadata?.phone || null;
  const role = user.user_metadata?.role || 'student';

  try {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: fullName,
        phone: phone,
        role: role
      })
      .select()
      .maybeSingle();

    if (newProfile) return newProfile;
  } catch (err) {
    console.warn('Profile auto-creation exception:', err);
  }

  return {
    id: user.id,
    email: user.email,
    full_name: fullName,
    phone: phone,
    role: role
  };
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
