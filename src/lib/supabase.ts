import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublicKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

const sessionStorageAdapter = typeof window === 'undefined' ? undefined : {
  getItem: (key: string) => {
    try { return window.sessionStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { window.sessionStorage.setItem(key, value); } catch { /* Browser storage may be disabled. */ }
  },
  removeItem: (key: string) => {
    try { window.sessionStorage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
  },
};

/**
 * Stage A leaves the local app as its source of truth. Missing env vars do not
 * prevent the current app from starting; later stages can use the typed client.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabasePublicKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Session restoration survives refreshes without writing auth tokens to localStorage.
        storage: sessionStorageAdapter,
      },
    })
  : null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).',
    );
  }
  return supabase;
}
