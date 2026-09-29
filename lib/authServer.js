import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Single shared Supabase client for all server-side API routes
// Prevents creating multiple GoTrueClient instances per request
let _serverSupabase = null;

function getServerSupabase() {
  if (!_serverSupabase && supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co') {
    _serverSupabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _serverSupabase;
}

/**
 * Extract and verify the authenticated user from a request's Authorization header.
 * Shared across all API routes to avoid duplicating auth logic and Supabase clients.
 */
export async function getAuthUser(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7);
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        // Hard 10s bound: supabase-js has no timeout of its own, so a DNS/network
        // blip against the Supabase API would otherwise hang every request forever.
        const { data: { user }, error } = await Promise.race([
          supabase.auth.getUser(jwtToken),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase auth verification timed out after 10s')), 10000)
          ),
        ]);
        if (!error && user) return user;
      } catch (e) {
        console.warn('JWT verification error:', e.message);
      }
    }
  }
  return null;
}
