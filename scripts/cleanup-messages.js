/**
 * Cleanup oversized chat messages in MongoDB.
 *
 * Finds documents in 'aichat.messages' whose content is larger than a size
 * threshold (default 200 KB of characters) and either:
 *   - DRY RUN (default): lists them — chatId, role, size, date — and changes nothing
 *   - --apply: truncates their content in the database to --max-chars and strips
 *     base64/dataUrl payloads from their attachments metadata
 *
 * Usage (ONE line in PowerShell, from project root):
 *   node scripts/cleanup-messages.js
 *   node scripts/cleanup-messages.js --min-size 500000
 *   node scripts/cleanup-messages.js --apply --max-chars 50000
 *
 * Reads MONGODB_URI from .env.local automatically. Never prints message content.
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');
const { MongoClient } = require('mongodb');

// ── Load .env.local (plain node doesn't read it) ──
try {
  const envRaw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  }
} catch {
  console.warn('! Could not read .env.local — relying on existing env vars');
}

if (!process.env.MONGODB_URI) {
  console.error('X MONGODB_URI is not set in .env.local or the environment');
  process.exit(1);
}

// ── Args ──
const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const APPLY = args.includes('--apply');
const MIN_SIZE = parseInt(getArg('--min-size', '200000'), 10); // chars of content considered "oversized"
const MAX_CHARS = parseInt(getArg('--max-chars', '50000'), 10); // truncation target with --apply

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db('aichat');
    const coll = db.collection('messages');

    const cursor = coll
      .find(
        { content: { $type: 'string', $exists: true } },
        { projection: { chatId: 1, role: 1, createdAt: 1, attachments: 1, size: { $strLenCP: '$content' } } }
      )
      .sort({ size: -1 })
      .limit(500);

    let found = 0;
    let fixed = 0;
    for await (const doc of cursor) {
      if ((doc.size || 0) < MIN_SIZE) break; // sorted desc — everything after is smaller
      found++;
      const date = doc.createdAt ? new Date(doc.createdAt).toLocaleString() : '?';
      console.log(`  ${doc._id}  chat=${doc.chatId}  role=${doc.role}  ${(doc.size / 1024).toFixed(0)} KB  ${date}`);

      if (APPLY) {
        const update = { $set: { content: doc.content.substring(0, MAX_CHARS) + '\n\n[... truncated by cleanup script ...]' } };
        if (Array.isArray(doc.attachments) && doc.attachments.length > 0) {
          // Drop base64 payloads from stored attachment metadata, keep the rest
          update.$set.attachments = doc.attachments.map((a) => {
            if (!a || typeof a !== 'object') return { name: String(a || 'file') };
            const { dataUrl, textContent, ...meta } = a;
            if (typeof textContent === 'string' && textContent.length > 20000) {
              meta.preview = textContent.slice(0, 20000);
            }
            return meta;
          });
        }
        await coll.updateOne({ _id: doc._id }, update);
        fixed++;
      }
    }

    console.log('');
    if (!APPLY) {
      console.log(`DRY RUN: ${found} oversized message(s) found (>= ${MIN_SIZE.toLocaleString()} chars). Nothing changed.`);
      console.log(`Re-run with: node scripts/cleanup-messages.js --apply --max-chars ${MAX_CHARS}`);
    } else {
      console.log(`DONE: truncated ${fixed} of ${found} oversized message(s) to ${MAX_CHARS.toLocaleString()} chars.`);
    }
  } catch (err) {
    console.error(`X Cleanup failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
})();
