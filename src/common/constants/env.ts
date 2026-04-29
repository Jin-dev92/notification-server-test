export const ENV_KEY = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  DATABASE_URL: 'DATABASE_URL',
  REDIS_URL: 'REDIS_URL',
  CLIENT_URL: 'CLIENT_URL',
} as const;

export type EnvKey = (typeof ENV_KEY)[keyof typeof ENV_KEY];
export type AppConfig = Record<EnvKey, string>;

export const IS_PRODUCTION = process.env[ENV_KEY.NODE_ENV] === 'production';
