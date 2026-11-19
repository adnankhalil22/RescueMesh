// Creates backend/.env from .env.example with a freshly generated JWT secret.
// Never overwrites an existing .env.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

if (existsSync(envPath)) {
  console.log('.env already exists — leaving it unchanged');
} else {
  const template = readFileSync(path.join(root, '.env.example'), 'utf8');
  const secret = randomBytes(48).toString('hex');
  writeFileSync(envPath, template.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
  console.log('Created .env with a random JWT_SECRET');
}
