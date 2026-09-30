/**
 * Read-only: list users with a stored API key and whether the CURRENT
 * ENCRYPTION_SECRET can still decrypt it. Prints NO key material.
 *
 * Usage: node scripts/list-bound-keys.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
}
if (!process.env.MONGODB_URI) { console.error('X MONGODB_URI not set'); process.exit(1); }
if (!process.env.ENCRYPTION_SECRET) { console.error('X ENCRYPTION_SECRET not set'); process.exit(1); }

function canDecrypt(s) {
  if (!s) return false;
  if (!s.startsWith('enc:')) return true;
  try {
    const p = s.split(':');
    const k = crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET).digest();
    const d = crypto.createDecipheriv('aes-256-cbc', k, Buffer.from(p[1], 'hex'));
    d.update(p[2], 'hex', 'utf8'); d.final('utf8');
    return true;
  } catch { return false; }
}

(async () => {
  const c = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await c.connect();
    const users = await c.db('aichat').collection('users').find({ apiKey: { $exists: true, $ne: null } }).toArray();
    console.log(`Users with a stored key: ${users.length}`);
    for (const u of users) {
      console.log(`  ${u.email || u.userId || '(no id)'}  ->  ${canDecrypt(u.apiKey) ? 'READABLE' : 'NOT readable (needs re-bind)'}`);
    }
  } catch (e) {
    console.error(`X ${e.message}`);
    process.exitCode = 1;
  } finally {
    await c.close().catch(() => {});
  }
})();
