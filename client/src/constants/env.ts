export const ENV = {
  API_URL: import.meta.env.VITE_API_URL as string,
} as const;

export const IS_PRODUCTION = import.meta.env.MODE === 'production';

export const getDevtoolsConfig = (name: string) => ({
  name,
  enabled: !IS_PRODUCTION,
});
