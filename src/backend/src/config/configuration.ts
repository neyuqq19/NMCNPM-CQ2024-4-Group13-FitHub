export interface AppConfig {
  port: number;
  databaseUrl: string;
  directUrl?: string;
  webOrigins: string[];
  sessionSecret: string;
  nodeEnv: string;
}

export const getAppConfig = (): AppConfig => ({
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  webOrigins: (process.env.WEB_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim()),
  sessionSecret: process.env.SESSION_SECRET || 'fithub-development-session-secret-key-32chars',
  nodeEnv: process.env.NODE_ENV || 'development',
});
