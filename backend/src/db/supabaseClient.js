import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';
import logger from '../utils/logger.js';


if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  process.exit(1);
}



export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

logger.info('✅  Supabase Client Initialized');

export default supabase;
