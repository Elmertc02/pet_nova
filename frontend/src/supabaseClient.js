import { createClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl = 'https://ejzvgjnhuxazhatwjtbz.supabase.co';
const fallbackSupabasePublishableKey = 'sb_publishable_aqNJsYP5YicL1UymtEfRoQ_0aw-mzYv';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackSupabasePublishableKey;
export const supabaseConfigReady = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseConfigReady
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;
