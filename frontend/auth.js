import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
let supabaseClient = null;

async function initializeSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    // Fetch config from server
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('Failed to fetch Supabase configuration');
    }

    const { supabaseUrl, supabaseAnonKey } = await response.json();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials are not configured. Please check your .env file.');
    }

    console.log('✅ Supabase initialized with URL:', supabaseUrl);
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    return supabaseClient;
  } catch (error) {
    console.error('❌ Failed to initialize Supabase:', error.message);
    throw error;
  }
}

/**
 * Sign up a new user with email and password
 */
export async function signUpUser(email, password, fullName) {
  try {
    console.log('📝 Signing up user:', email);
    
    const client = await initializeSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      console.error('❌ Sign up error:', error);
      throw error;
    }

    console.log('✅ Sign up successful:', data);

    // Auto-confirm email using backend endpoint
    if (data.user && data.user.id) {
      try {
        console.log('📧 Confirming email via backend...');
        const confirmResponse = await fetch('/api/confirm-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: data.user.id,
            email: email,
          }),
        });

        const confirmData = await confirmResponse.json();
        if (confirmData.ok) {
          console.log('✅ Email auto-confirmed');
        } else {
          console.warn('⚠️ Email confirmation skipped:', confirmData.message || confirmData.error);
        }
      } catch (confirmError) {
        console.warn('⚠️ Email confirmation API call failed:', confirmError.message);
        // Don't fail the signup if confirmation fails
      }
    }

    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    console.error('❌ Sign up failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in existing user with email and password
 */
export async function loginUser(email, password) {
  try {
    console.log('🔑 Logging in user:', email);
    
    const client = await initializeSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Login error:', error);
      throw error;
    }

    console.log('✅ Login successful:', data);
    // Store session in localStorage
    if (data.session) {
      localStorage.setItem('authSession', JSON.stringify(data.session));
    }
    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  try {
    console.log('🚪 Signing out user');
    const client = await initializeSupabase();
    const { error } = await client.auth.signOut();
    
    if (error) throw error;
    
    localStorage.removeItem('authSession');
    console.log('✅ Sign out successful');
    return { success: true };
  } catch (error) {
    console.error('❌ Sign out failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  try {
    const client = await initializeSupabase();
    const { data, error } = await client.auth.getUser();
    
    if (error) {
      console.log('No active session');
      return null;
    }
    
    return data.user;
  } catch (error) {
    console.error('Error fetching user:', error.message);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isUserAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

/**
 * Get the Supabase client instance
 */
export async function getSupabaseClient() {
  return await initializeSupabase();
}
