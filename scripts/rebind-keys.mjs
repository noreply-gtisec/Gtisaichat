/**
 * Re-bind per-user OpenRouter API keys after an ENCRYPTION_SECRET change.
 *
 * This mirrors what POST /api/admin/bind-key does (encrypt + upsert into the
 * 'users' collection), but runs offline using .env.local — you don't need the
 * web server running. Keys are read from a local JSON file so they never have
 * to be pasted into a terminal, chat, or committed to git.
 *
 * DRY RUN by default (lists what it WOULD do, writes nothing).
 *
 * Usage (one line, PowerShell, from project root):
 *   node scripts/rebind-keys.mjs                 — dry run, reads rebind-keys.json
 *   node scripts/rebind-keys.mjs --apply         — actually write to MongoDB
 *   node scripts/rebind-keys.mjs --file my.json  — use a different input file
 *
 * Input file format (rebind-keys.json):
 *   [
 *     { "email": "you@gtisec.com", "apiKey": "sk-or-v1-...." },
 *     { "userId": "supabase-uuid", "email": "x@gtisec.com", "apiKey": "sk-or-v1-...." }
 *   ]
 *
 * SECURITY: keep rebind-keys.json out of git (delete it after) — it holds raw keys.
 * The script never prints the key itself.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──
try {
  const envRaw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  }
} catch {
  console.warn('! Could not read .env.local — relying on existing env vars');
}

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const APPLY = args.includes('--apply');
const FILE = getArg('--file', 'rebind-keys.json');

if (!process.env.MONGODB_URI) {
  console.error('X MONGODB_URI is not set in .env.local');
  process.exit(1);
}
if (!process.env.ENCRYPTION_SECRET) {
  console.error('X ENCRYPTION_SECRET is not set in .env.local — refusing (keys must be encrypted with the app secret).');
  process.exit(1);
}

// ── Encrypt exactly like lib/crypto.js (AES-256-CBC, sha256(secret), random IV) ──
function encryptApiKey(text) {
  const keyBuffer = crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${enc}`;
}

// ── Try to decrypt an existing stored value (to confirm it's now unreadable) ──
function canDecrypt(stored) {
  if (!stored) return false;
  if (!stored.startsWith('enc:')) return true; // plaintext
  try {
    const parts = stored.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const keyBuffer = crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET).digest();
    const d = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let out = d.update(parts[2], 'hex', 'utf8');
    out += d.final('utf8');
    return !!out;
  } catch {
    return false;
  }
}

let entries;
try {
  entries = JSON.parse(readFileSync(resolve(process.cwd(), FILE), 'utf8'));
} catch (e) {
  console.error(`X Could not read input file "${FILE}": ${e.message}`);
  console.error('  Create it as an array: [{ "email": "...", "apiKey": "sk-or-..." }]');
  process.exit(1);
}
if (!Array.isArray(entries) || entries.length === 0) {
  console.error('X Input file must be a non-empty array of { email, userId?, apiKey }.');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db('aichat');
    const users = db.collection('users');

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${entries.length} entr(y/ies) from ${FILE}\n`);

    for (const e of entries) {
      if (!e.apiKey || (!e.email && !e.userId)) {
        console.log(`  SKIP: entry needs apiKey and (email or userId): ${JSON.stringify({ email: e.email, userId: e.userId })}`);
        continue;
      }
      const filter = e.userId ? { userId: e.userId } : { email: e.email };
      const existing = await users.findOne(filter);
      const oldReadable = existing ? canDecrypt(existing.apiKey) : null;

      const status = existing
        ? (oldReadable ? 'exists, old key still readable (secret unchanged for it)' : 'exists, OLD KEY UNREADABLE -> will be replaced')
        : 'no user yet -> will be created';
      console.log(`  ${e.email || e.userId}: ${status}`);

      if (APPLY) {
        const encryptedKey = encryptApiKey(e.apiKey);
        // Only set fields we actually have, so binding by email never clobbers
        // an existing userId (and vice-versa).
        const set = { apiKey: encryptedKey, updatedAt: new Date() };
        if (e.userId) set.userId = e.userId;
        if (e.email) set.email = e.email;
        await users.updateOne(
          filter,
          {
            $set: set,
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
        console.log(`     ✓ bound new key (encrypted with current ENCRYPTION_SECRET)`);
      }
    }

    console.log('');
    if (!APPLY) {
      console.log('DRY RUN complete — nothing was written. Re-run with --apply to bind.');
    } else {
      console.log('DONE. Reminder: delete your rebind-keys.json now (it contains raw keys) and restart the app server.');
    }
  } catch (err) {
    console.error(`X Failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
})();
