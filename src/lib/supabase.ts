import { createClient } from '@supabase/supabase-js';

export function getDb() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_KEY ?? '';
  return createClient(url, key);
}
