import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

// Never let a dead network hang a request for minutes
const CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: 8000, // fail in 8s instead of default 30s+ when DNS/network is down
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
};

let client;
let clientPromise;

if (uri) {
  if (process.env.NODE_ENV === 'development') {
    // If the cached promise REJECTED (e.g. one DNS blip at startup), every route
    // would await it forever-after and the app stays broken until server restart.
    // Detect the rejected state and rebuild the connection.
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, CLIENT_OPTIONS);
      global._mongoClientPromise = client.connect();
    } else {
      global._mongoClientPromise.catch(() => {}); // avoid unhandled rejection while probing
    }
    clientPromise = global._mongoClientPromise.then((c) => {
      if (c && typeof c.db === 'function') return c;
      // previous cached promise had rejected — create a fresh client
      console.warn('MongoDB: rebuilding connection after earlier failure');
      client = new MongoClient(uri, CLIENT_OPTIONS);
      global._mongoClientPromise = client.connect();
      return global._mongoClientPromise;
    }, () => {
      console.warn('MongoDB: initial connect failed, retrying with a fresh client');
      client = new MongoClient(uri, CLIENT_OPTIONS);
      global._mongoClientPromise = client.connect();
      return global._mongoClientPromise;
    });
  } else {
    client = new MongoClient(uri, CLIENT_OPTIONS);
    clientPromise = client.connect();
  }
} else {
  // Graceful fallback if MONGODB_URI is not set yet
  clientPromise = Promise.reject(new Error('MONGODB_URI is not configured in .env.local'));
}

// ── Create indexes once on first connection for fast queries ──
let _indexesCreated = false;

async function ensureIndexes() {
  if (_indexesCreated) return;
  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db('aichat');

    // Indexes for 'chats' collection — speeds up user chat list queries
    await db.collection('chats').createIndexes([
      { key: { userId: 1, updatedAt: -1 }, name: 'idx_chats_userId_updatedAt' },
      { key: { userEmail: 1, updatedAt: -1 }, name: 'idx_chats_userEmail_updatedAt' },
    ]);

    // Indexes for 'messages' collection — speeds up per-chat message loading
    await db.collection('messages').createIndexes([
      { key: { chatId: 1, createdAt: 1 }, name: 'idx_messages_chatId_createdAt' },
      { key: { userId: 1 }, name: 'idx_messages_userId' },
      { key: { userEmail: 1 }, name: 'idx_messages_userEmail' },
    ]);

    // Indexes for 'users' collection — speeds up API key lookups
    await db.collection('users').createIndexes([
      { key: { userId: 1 }, name: 'idx_users_userId', unique: true, sparse: true },
      { key: { email: 1 }, name: 'idx_users_email', sparse: true },
    ]);

    _indexesCreated = true;
    console.log('✓ MongoDB indexes ensured');
  } catch (err) {
    console.warn('MongoDB index creation warning:', err.message);
  }
}

// Trigger index creation on startup (non-blocking)
if (uri) {
  ensureIndexes();
}

export default clientPromise;
