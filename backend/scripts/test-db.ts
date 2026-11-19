// Prepares an isolated SQLite database (backend/prisma/test.db) for the
// automated tests: creates it / syncs the schema. Rows are cleared by
// tests/helpers.ts resetDb(), so the development database is never touched.
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
execSync('npx prisma db push --skip-generate', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:./test.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
});
