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
    if (authError) console.error('[Auth] getUser error:', authError);
    return null;
  }

  // 1. Determine intended role from metadata or email naming convention
  let inferredRole = user.user_metadata?.role;
  const userEmail = (user.email || '').toLowerCase();
  
  if (!inferredRole) {
    if (userEmail.startsWith('admin') || userEmail.includes('@admin') || userEmail.includes('admin@')) {
      inferredRole = 'admin';
    } else if (userEmail.startsWith('warden') || userEmail.includes('@warden') || userEmail.includes('warden@')) {
      inferredRole = 'warden';
    } else {
      inferredRole = 'student';
    }
  }

  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const phone = user.user_metadata?.phone || null;

  // 2. Fetch existing profile
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      // If profile exists but role should be upgraded/corrected
      const effectiveRole = profile.role || inferredRole;
      
      // Role auto-healing removed due to RLS policies.
      // Role auto-healing removed due to RLS policies.

      return {
        ...profile,
        email: user.email,
        role: profile.role || inferredRole
      };
    }

    if (error) {
      console.warn('[Auth] Profiles table read warning:', error);
    }
  } catch (err) {
    console.warn('[Auth] Profiles query exception:', err);
  }

  // 3. Auto-provision profile if missing
  try {
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        phone: phone,
        role: inferredRole
      })
      .select()
      .maybeSingle();

    if (newProfile) {
      return {
        ...newProfile,
        email: user.email,
        role: newProfile.role || inferredRole
      };
    }
  } catch (err) {
    console.warn('[Auth] Profile creation exception:', err);
  }

  return {
    id: user.id,
    email: user.email,
    full_name: fullName,
    phone: phone,
    role: inferredRole
  };
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
