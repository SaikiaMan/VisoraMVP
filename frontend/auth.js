import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
let supabaseClient = null;

async function fetchSupabaseConfig() {
  const configUrls = ['/api/config'];

  // Fallback for cases where frontend is opened from a different origin
  // than the backend (for example Live Server or file preview).
  if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:3000') {
    configUrls.push('http://localhost:3000/api/config');
  }

  let lastError = null;

  for (const configUrl of configUrls) {
    try {
      const response = await fetch(configUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Config request failed (${response.status}) at ${configUrl}`);
      }

      const config = await response.json();
      if (config?.supabaseUrl && config?.supabaseAnonKey) {
        return config;
      }

      throw new Error(`Supabase config missing URL/key at ${configUrl}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Could not load Supabase configuration.');
}

async function initializeSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    const { supabaseUrl, supabaseAnonKey } = await fetchSupabaseConfig();

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

function isAlreadyRegisteredError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('email exists') ||
    message.includes('duplicate') ||
    code.includes('already_exists') ||
    code.includes('email_exists')
  );
}

function isInvalidCredentialError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    code.includes('invalid_credentials') ||
    code.includes('invalid_grant')
  );
}

/**
 * Sign up a new user with email and password
 */
export async function signUpUser(email, password, fullName) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(fullName || '').trim();

    console.log('📝 Signing up user:', normalizedEmail);
    
    const client = await initializeSupabase();
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedName,
        },
      },
    });

    if (error) {
      if (isAlreadyRegisteredError(error)) {
        return {
          success: false,
          error: 'Account already exists. Please log in instead.',
          errorCode: 'ACCOUNT_EXISTS',
        };
      }

      console.error('❌ Sign up error:', error);
      throw error;
    }

    if (!data?.user?.id) {
      return {
        success: false,
        error: 'Unable to create account right now. Please try logging in or try again in a moment.',
      };
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
    const normalizedEmail = String(email || '').trim().toLowerCase();
    console.log('🔑 Logging in user:', normalizedEmail);
    
    const client = await initializeSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      if (isInvalidCredentialError(error)) {
        return {
          success: false,
          error:
            'Invalid email or password. If this account already exists, use the correct password or reset it.',
          errorCode: 'INVALID_CREDENTIALS',
        };
      }

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
