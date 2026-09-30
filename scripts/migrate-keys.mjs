/**
 * Transparent key migration: re-encrypt existing per-user OpenRouter keys from
 * the OLD public default secret to the CURRENT ENCRYPTION_SECRET.
 *
 * Why this works: keys stored before the fallback was removed were encrypted
 * with the known default 'gtis-cybersecurity-secret-key-32b'. We can decrypt
 * those with the default and re-encrypt with the new secret, so users do NOT
 * need to re-supply their keys.
 *
 * DRY RUN by default (lists what it WOULD migrate, writes nothing).
 *   node scripts/migrate-keys.mjs            — dry run
 *   node scripts/migrate-keys.mjs --apply    — actually re-encrypt + save
 *
 * Never prints any key material.
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

const OLD_DEFAULT = 'gtis-cybersecurity-secret-key-32b';
const APPLY = process.argv.slice(2).includes('--apply');

if (!process.env.MONGODB_URI) { console.error('X MONGODB_URI not set'); process.exit(1); }
if (!process.env.ENCRYPTION_SECRET) { console.error('X ENCRYPTION_SECRET not set'); process.exit(1); }

const keyBufFor = (secret) => crypto.createHash('sha256').update(secret).digest();

function decryptWith(stored, secret) {
  if (!stored || !stored.startsWith('enc:')) return null;
  try {
    const p = stored.split(':');
    const d = crypto.createDecipheriv('aes-256-cbc', keyBufFor(secret), Buffer.from(p[1], 'hex'));
    let out = d.update(p[2], 'hex', 'utf8');
    out += d.final('utf8');
    return out;
  } catch { return null; }
}

function encryptWithNew(plain) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBufFor(process.env.ENCRYPTION_SECRET), iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${enc}`;
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const users = client.db('aichat').collection('users');
    const docs = await users.find({ apiKey: { $exists: true, $ne: null } }).toArray();

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — found ${docs.length} user(s) with a stored key\n`);

    let toMigrate = 0;
    for (const u of docs) {
      const id = u.email || u.userId || u._id.toString();
      const raw = u.apiKey;

      if (!raw.startsWith('enc:')) {
        console.log(`  ${id}: stored as PLAINTEXT (no enc: prefix) -> leaving as-is`);
        continue;
      }
      // Already readable with the new secret? then nothing to do.
      if (decryptWith(raw, process.env.ENCRYPTION_SECRET)) {
        console.log(`  ${id}: already encrypted with current secret -> skip`);
        continue;
      }
      // Try the old default.
      const plain = decryptWith(raw, OLD_DEFAULT);
      if (!plain) {
        console.log(`  ${id}: encrypted with an UNKNOWN secret -> CANNOT migrate (this user must re-bind manually)`);
        continue;
      }

      toMigrate++;
      console.log(`  ${id}: readable via old default -> ${APPLY ? 're-encrypting with new secret' : 'WOULD re-encrypt with new secret'}`);

      if (APPLY) {
        const reEncrypted = encryptWithNew(plain);
        await users.updateOne({ _id: u._id }, { $set: { apiKey: reEncrypted, updatedAt: new Date() } });
        console.log(`     ✓ migrated`);
      }
    }

    console.log('');
    if (!APPLY) {
      console.log(`DRY RUN complete — ${toMigrate} key(s) would be migrated. Nothing written. Re-run with --apply.`);
    } else {
      console.log(`DONE — ${toMigrate} key(s) migrated to the new secret. Now delete this note to yourself: restart the app server.`);
    }
  } catch (e) {
    console.error(`X ${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
})();
