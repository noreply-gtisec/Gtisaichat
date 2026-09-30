/**
 * Deep hang diagnostic for GTIS AI Chatbot
 *
 * Tests every external dependency the "send message" flow touches and times
 * each phase (DNS → TCP → TLS → HTTP → streaming first token), so we can find
 * exactly WHICH call hangs when the app freezes.
 *
 * Usage (from project root — PowerShell-safe form uses env vars, see notes below):
 *   node scripts/debug-hang.mjs                       — network probes + MongoDB + env dump
 *   node scripts/debug-hang.mjs --from-db             — list users that have stored keys
 *   node scripts/debug-hang.mjs --from-db you@x.com   — decrypt your stored key & run the stream test
 *   $env:OR_KEY='sk-or-...'; node scripts/debug-hang.mjs  — stream test with an explicit key
 *   node scripts/debug-hang.mjs --rounds 5           — repeat probes to catch intermittent stalls
 *
 * Note: keep each command on ONE line. A wrapped line makes PowerShell parse
 * "--model" as its own parameter and throw "Missing expression after unary operator '--'".
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import net from 'net';
import tls from 'tls';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local manually (plain node doesn't read it) ──
try {
  const envRaw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  }
} catch {
  console.warn('! Could not read .env.local — env-based probes may skip');
}

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  const v = i !== -1 ? args[i + 1] : null;
  // A value starting with '-' is the NEXT flag, not this flag's value
  return v && !v.startsWith('-') ? v : null;
};
const ROUNDS = parseInt(getArg('--rounds') || process.env.DEBUG_ROUNDS || '1', 10);
// Env vars are the PowerShell-safe route: $env:OR_KEY='sk-or-...'  (avoids '--' being parsed as a PS param)
const CLI_KEY = getArg('--key') || process.env.OR_KEY || process.env.OPENROUTER_API_KEY || null;
const MODEL_ARG = getArg('--model') || process.env.OR_MODEL || 'openai/gpt-6-luna-pro';
const TIMEOUT_MS = parseInt(getArg('--timeout') || process.env.DEBUG_TIMEOUT || '15000', 10);

// Pull the API key straight out of MongoDB so it never has to be pasted into a command
const FROM_DB_RAW = getArg('--from-db');
const FROM_DB_EMAIL = FROM_DB_RAW && !/^[\d.]+$/.test(FROM_DB_RAW) ? FROM_DB_RAW : null;
const USE_DB_KEY = args.includes('--from-db');

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const ok = (ms) => `${C.g}PASS${C.x} (${ms}ms)`;
const fail = (ms, why) => `${C.r}FAIL${C.x} (${ms}ms) ${C.y}${why}${C.x}`;

function hr(title) {
  console.log(`\n${C.c}━━━ ${title} ${'━'.repeat(Math.max(0, 52 - title.length))}${C.x}`);
}

const now = () => Number(process.hrtime.bigint() / 1000000n);

// ── Phase-by-phase network probe ──
async function probeHost(hostname, port = 443, useTls = port === 443) {
  const t = { dns: null, tcp: null, tls: null };
  const start = now();
  try {
    await lookup(hostname);
    t.dns = now() - start;

    const tcpStart = now();
    await new Promise((res, rej) => {
      const s = net.connect({ host: hostname, port, timeout: TIMEOUT_MS });
      s.once('connect', () => { s.destroy(); res(); });
      s.once('timeout', () => { s.destroy(); rej(new Error('TCP connect timeout (firewall/proxy blocking?)')); });
      s.once('error', (e) => rej(e));
    });
    t.tcp = now() - tcpStart;

    if (!useTls) return { ok: true, t }; // raw TCP service (e.g. MongoDB 27017) — no TLS handshake

    const tlsStart = now();
    await new Promise((res, rej) => {
      const s = tls.connect({ host: hostname, port, timeout: TIMEOUT_MS, servername: hostname });
      s.once('secureConnect', () => { s.end(); res(); });
      s.once('timeout', () => { s.destroy(); rej(new Error('TLS handshake timeout (MITM proxy / DPI?)')); });
      s.once('error', (e) => rej(e));
    });
    t.tls = now() - tlsStart;

    return { ok: true, t };
  } catch (e) {
    return { ok: false, t, error: e.message };
  }
}

// ── HTTP probe with AbortController so it can never hang ──
async function probeUrl(label, url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`aborted after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  const start = now();
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const ms = now() - start;
    return { status: res.status, ms, ok: res.ok };
  } catch (e) {
    return { ms: now() - start, ok: false, error: e.cause?.message || e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── OpenRouter streaming TTFB (time-to-first-token) test ──
async function testOpenRouterStream(apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('stream aborted after 90s')), 90000);
  const start = now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'GTIS Debug Script',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
      signal: controller.signal,
    });
    const ttfbHeaders = now() - start;
    console.log(`   headers received in ${ttfbHeaders}ms (HTTP ${res.status})`);

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let firstTokenMs = null;
    let tokenChars = 0;
    const readStart = now();
    while (now() - readStart < 60000) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (firstTokenMs === null && chunk.includes('delta') && /"content"\s*:\s*"[^"]/.test(chunk)) {
        firstTokenMs = now() - start;
      }
      tokenChars += chunk.length;
      if (firstTokenMs !== null && tokenChars > 500) break;
    }
    reader.cancel().catch(() => {});
    return { ok: firstTokenMs !== null, ttfbHeaders, firstTokenMs, error: firstTokenMs === null ? 'NO TOKENS RECEIVED in 60s — upstream/provider hang' : null };
  } catch (e) {
    return { ok: false, error: e.cause?.message || e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Read + decrypt a stored API key straight from MongoDB ──
// Mirrors lib/crypto.js so no secret ever needs typing on the command line.
async function resolveDbKey() {
  if (!process.env.MONGODB_URI) {
    console.log(`   ${C.y}--from-db skipped: MONGODB_URI not present in .env.local${C.x}`);
    return null;
  }
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db('aichat');
    const users = await db.collection('users').find({ apiKey: { $exists: true, $ne: null } }).limit(25).toArray();

    if (users.length === 0) {
      console.log(`   ${C.y}No users with a bound API key found in 'aichat.users'${C.x}`);
      return null;
    }

    if (!FROM_DB_EMAIL) {
      console.log(`   ${C.c}Users with stored keys:${C.x}`);
      for (const u of users) console.log(`     ${u.email || u.userId || '(no email)'}  bound ${u.updatedAt ? new Date(u.updatedAt).toLocaleString() : '?'}`);
      console.log(`\n   ${C.d}re-run with: node scripts/debug-hang.mjs --from-db you@domain.com${C.x}`);
      return null;
    }

    const match = users.find((u) => (u.email || '').toLowerCase() === FROM_DB_EMAIL.toLowerCase()) ||
      users.find((u) => u.userId === FROM_DB_EMAIL);
    if (!match) {
      console.log(`   ${C.r}No stored key for '${FROM_DB_EMAIL}'. Available:${C.x}`);
      for (const u of users) console.log(`     ${u.email || u.userId}`);
      return null;
    }

    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
      console.log(`   ${C.r}ENCRYPTION_SECRET is not set in .env.local — cannot decrypt stored keys${C.x}`);
      return null;
    }
    const { createHash, createDecipheriv } = await import('crypto');
    const raw = match.apiKey;
    if (!raw.startsWith('enc:')) {
      console.log(`   key stored in plaintext for ${FROM_DB_EMAIL}`);
      return raw;
    }
    const parts = raw.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const keyBuffer = createHash('sha256').update(secret).digest();
    const decipher = createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    console.log(`   ${C.g}loaded key for ${match.email || match.userId}${C.x} (${decrypted.slice(0, 8)}…${decrypted.slice(-4)})`);
    return decrypted;
  } catch (e) {
    console.log(`   ${C.r}--from-db failed: ${e.message}${C.x}`);
    return null;
  } finally {
    await client.close().catch(() => {});
  }
}

// ── Main ──
hr('0. Environment');
console.log(`   node ${process.version} | proxy env vars: ${JSON.stringify({
  HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || null,
  HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || null,
  NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || null,
})}`);
console.log(`   MONGODB_URI: ${process.env.MONGODB_URI ? 'set' : 'NOT SET'} | SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'} | ENCRYPTION_SECRET: ${process.env.ENCRYPTION_SECRET ? 'set' : 'using hardcoded default'}`);

let effectiveKey = CLI_KEY;
if (USE_DB_KEY) {
  hr('KEY. Loading API key from MongoDB');
  effectiveKey = (await resolveDbKey()) || effectiveKey;
}

let worst = [];

for (let round = 1; round <= ROUNDS; round++) {
  if (ROUNDS > 1) hr(`ROUND ${round} of ${ROUNDS}`);

  hr('1. DNS / TCP / TLS reachability (where hangs usually live)');
  const hosts = [
    ['Supabase Auth', new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co').hostname],
    ['OpenRouter', 'openrouter.ai'],
  ];
  if (process.env.MONGODB_URI) {
    // Atlas seedlist hosts (cluster0.xxx.mongodb.net) have NO A record by design —
    // they only serve SRV. Probe the real shard hosts instead or you get false FAILs.
    try {
      const seedHost = new URL(process.env.MONGODB_URI).hostname;
      if (/^mongodb\+srv/i.test(process.env.MONGODB_URI)) {
        const srv = await dns.promises.resolveSrv(`_mongodb._tcp.${seedHost}`);
        for (const r of srv.slice(0, 3)) hosts.push(['MongoDB shard', r.name, r.port || 27017]);
      } else {
        hosts.push(['MongoDB', seedHost, 27017]);
      }
    } catch (e) {
      console.log(`   ${C.y}! Could not expand MongoDB SRV records: ${e.code || e.message}${C.x}`);
    }
  }
  for (const [label, hostname, port] of hosts) {
    const r = await probeHost(hostname, port, port === 443);
    if (r.ok) {
      const tlsTxt = r.t.tls === null ? '' : ` tls=${r.t.tls}ms`;
      console.log(`   ${label.padEnd(14)} ${hostname.padEnd(38)} dns=${r.t.dns}ms tcp=${r.t.tcp}ms${tlsTxt} ${r.t.tcp > 3000 || (r.t.tls ?? 0) > 3000 ? C.y + '⚠ SLOW' : C.g + '✓'}`);
      if (r.t.tcp > 3000 || (r.t.tls ?? 0) > 3000) worst.push(`${label}: slow TCP/TLS (${r.t.tcp}/${r.t.tls}ms)`);
    } else {
      console.log(`   ${label.padEnd(14)} ${hostname.padEnd(38)} ${fail(r.t.dns ?? 0, r.error)}`);
      worst.push(`${label}: ${r.error}`);
    }
  }

  hr('2. Supabase auth endpoint (runs on EVERY request via getAuthUser)');
  const sb = await probeUrl('supabase', `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'}/auth/v1/health`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
  });
  console.log(`   /auth/v1/health → ${sb.ok ? ok(sb.ms) : fail(sb.ms, sb.error || `HTTP ${sb.status}`)}`);
  if (!sb.ok || sb.ms > 5000) worst.push(`Supabase auth HTTP: ${sb.error || sb.status + ' ' + sb.ms + 'ms'}`);

  hr('3. OpenRouter API (the /send-message stream)');
  const or = await probeUrl('openrouter', 'https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${effectiveKey || 'sk-or-livetest-probe-only'}` },
  });
  console.log(`   /api/v1/key    → ${or.ok ? `${C.g}key valid${C.x} in ${or.ms}ms` : (or.status === 401 ? `${C.y}reachable (401${effectiveKey ? ' — STORED KEY IS INVALID/EXHAUSTED' : ' = probe key, expected'})${C.x} in ${or.ms}ms` : fail(or.ms, or.error || `HTTP ${or.status}`))}`);
  if (!or.ok && or.status !== 401) worst.push(`OpenRouter HTTP: ${or.error || or.status}`);
  if (or.status === 401 && effectiveKey) worst.push('OpenRouter rejected the stored API key (401) — invalid, out of credits, or wrong ENCRYPTION_SECRET');

  hr('4. MongoDB connection (serverSelectionTimeoutMS: 5s)');
  if (process.env.MONGODB_URI) {
    try {
      const { MongoClient } = await import('mongodb');
      const start = now();
      const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      await client.db('aichat').command({ ping: 1 });
      console.log(`   ping → ${ok(now() - start)}`);
      await client.close();
    } catch (e) {
      console.log(`   ping → ${fail(0, e.message)}`);
      worst.push(`MongoDB: ${e.message}`);
    }
  } else {
    console.log(`   ${C.y}SKIPPED (MONGODB_URI not set)${C.x}`);
  }

  if (effectiveKey) {
    hr('5. OpenRouter streaming "hi" — TTFB & token flow (same as your app)');
    const model = MODEL_ARG;
    const s = await testOpenRouterStream(effectiveKey, model);
    if (s.ok) {
      console.log(`   model=${model}  headers=${s.ttfbHeaders}ms  first-token=${s.firstTokenMs}ms ${s.firstTokenMs > 15000 ? C.y + '⚠ SLOW UPSTREAM' : C.g + '✓'}`);
      if (s.firstTokenMs > 15000) worst.push(`OpenRouter stream: first token took ${s.firstTokenMs}ms`);
    } else {
      console.log(`   ${fail(0, s.error)}`);
      worst.push(`OpenRouter stream: ${s.error}`);
    }
  } else {
    hr('5. OpenRouter streaming test — SKIPPED');
    console.log(`   ${C.d}PowerShell-safe way:${C.x}`);
    console.log(`   ${C.d}  $env:OR_KEY='sk-or-...'; $env:OR_MODEL='openai/gpt-6-luna-pro'; node scripts/debug-hang.mjs${C.x}`);
  }
}

hr('VERDICT');
// Detect hung handles keeping process alive
const handles = process._getActiveHandles?.() || [];
if (worst.length === 0) {
  console.log(`   ${C.g}All dependencies healthy.${C.x} If the app still hangs, the hang is inside app code, not network — rerun with --rounds 5 while reproducing.`);
} else {
  console.log(`   ${C.r}Found ${worst.length} problem(s):${C.x}`);
  for (const w of worst) console.log(`   ${C.y}• ${w}${C.x}`);
}
console.log(`   active handles at exit: ${handles.length}`);
process.exit(0);
