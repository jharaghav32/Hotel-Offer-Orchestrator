import { z } from 'zod';
import { deepFreeze, type DeepReadonly } from '../shared/immutable';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  TEMPORAL_ADDRESS: z.string().min(1).default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('hotel-offers'),
  SUPPLIER_BASE_URL: z.url().default('http://localhost:3000'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type AppConfig = DeepReadonly<{
  env: 'development' | 'test' | 'production';
  http: { port: number };
  log: { level: string };
  redis: { url: string };
  temporal: { address: string; namespace: string; taskQueue: string };
  suppliers: { baseUrl: string; timeoutMs: number };
  cache: { ttlSeconds: number };
}>;

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const env = parsed.data;

  return deepFreeze({
    env: env.NODE_ENV,
    http: { port: env.PORT },
    log: { level: env.LOG_LEVEL },
    redis: { url: env.REDIS_URL },
    temporal: {
      address: env.TEMPORAL_ADDRESS,
      namespace: env.TEMPORAL_NAMESPACE,
      taskQueue: env.TEMPORAL_TASK_QUEUE,
    },
    suppliers: {
      baseUrl: env.SUPPLIER_BASE_URL.replace(/\/+$/, ''),
      timeoutMs: env.SUPPLIER_TIMEOUT_MS,
    },
    cache: { ttlSeconds: env.CACHE_TTL_SECONDS },
  });
}

export const config = loadConfig();
