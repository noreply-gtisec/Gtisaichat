/**
 * Backfill script: Generates embeddings for all existing document chunks in MongoDB Atlas
 * that don't have the 'embedding' field yet.
 * 
 * Usage: node scripts/backfill-embeddings.mjs
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

function decryptKey(enc) {
  const parts = enc.split(':');
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(parts[1], 'hex'));
  return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('aichat');

// Get a working API key from any user
const userDoc = await db.collection('users').findOne({ apiKey: { $exists: true, $ne: null } });
if (!userDoc) {
  console.error('No user found with an API key');
  process.exit(1);
}
const apiKey = decryptKey(userDoc.apiKey);

const totalUnembedded = await db.collection('document_chunks').countDocuments({
  $or: [{ embedding: { $exists: false } }, { embedding: null }]
});

console.log(`Found ${totalUnembedded} chunks needing embeddings...`);

if (totalUnembedded === 0) {
  console.log('All chunks already have embeddings! Nothing to do.');
  await client.close();
  process.exit(0);
}

const BATCH_SIZE = 50;
let processed = 0;

while (true) {
  const chunks = await db.collection('document_chunks')
    .find({ $or: [{ embedding: { $exists: false } }, { embedding: null }] })
    .limit(BATCH_SIZE)
    .toArray();

  if (chunks.length === 0) break;

  const texts = chunks.map((c) => c.text || '');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gtis.ai',
        'X-Title': 'GTIS Backfill Embeddings',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Batch failed (HTTP ${res.status}):`, err);
      break;
    }

    const data = await res.json();
    const sortedEmbeddings = [...data.data].sort((a, b) => a.index - b.index);

    const bulkOps = chunks.map((chunk, idx) => ({
      updateOne: {
        filter: { _id: chunk._id },
        update: { $set: { embedding: sortedEmbeddings[idx].embedding } }
      }
    }));

    await db.collection('document_chunks').bulkWrite(bulkOps);
    processed += chunks.length;
    console.log(`Progress: ${processed} / ${totalUnembedded} chunks embedded (${Math.round((processed / totalUnembedded) * 100)}%)`);
  } catch (err) {
    console.error('Error during embedding generation:', err.message);
    break;
  }
}

console.log(`\nDone! Successfully embedded ${processed} chunks in MongoDB Atlas.`);
await client.close();
