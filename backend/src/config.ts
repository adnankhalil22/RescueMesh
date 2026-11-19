import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. Run "npm run setup" in backend/.`);
  return v;
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
  isTest: process.env.NODE_ENV === 'test',
};

if (config.jwtSecret.length < 32 && !config.isTest) {
  console.warn('[security] JWT_SECRET is short; use at least 32 random characters.');
}
