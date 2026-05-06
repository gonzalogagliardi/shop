import { createClient } from '@supabase/supabase-js';

export function getDb() {
  const url = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = import.meta.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return createClient(url, key);
}
