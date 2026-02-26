// src/lib/supabase.ts
// Thin wrapper that re‑exports the singleton client and provides a public client.

import { supabase } from './supabaseClient';
export { supabase };               // <-- main app uses this

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------
// Public client – no persisted session, no auto‑refresh
// ---------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('🚨 CRITICAL: Supabase URL or ANON KEY missing!');
}

const safeUrl = supabaseUrl ?? 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey ?? 'placeholder';

export const publicSupabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
