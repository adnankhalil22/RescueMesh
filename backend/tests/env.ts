// Loaded before anything touches Prisma or config.
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing-0123456789';
process.env.NODE_ENV = 'test';
