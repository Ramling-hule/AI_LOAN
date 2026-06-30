import { z } from 'zod';






const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),

  
  SUPABASE_URL: z.string().url('SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(30, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  
  AI_SERVICE_URL: z.string().url().default('http://localhost:5001'),

  
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('❌  Invalid environment variables:\n', _parsed.error.format());
  process.exit(1);
}

export default _parsed.data;
