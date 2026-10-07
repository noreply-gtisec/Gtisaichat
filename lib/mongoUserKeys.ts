// lib/mongoUserKeys.ts
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI must be defined in the environment");
}

let cachedClient: MongoClient | null = null;
/**
 * Returns a shared MongoClient instance. Re‑uses the same connection across calls.
 */
async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient && (cachedClient as any).isConnected?.()) {
    return cachedClient;
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

/**
 * Retrieves the stored OpenRouter (or OpenAI) API key for a given user.
 * The collection `users` (or `user_api_keys`) must contain a document like:
 *   { _id: ObjectId(...), userId: "<supabase‑uid>", openrouterKey: "or_…" }
 * If the user has no key, `null` is returned.
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
  const client = await getMongoClient();
  const db = client.db(); // uses DB name encoded in the URI
  const collection = db.collection("users"); // adjust if you store keys elsewhere
  const doc = await collection.findOne({ userId });
  if (doc && typeof (doc as any).openrouterKey === "string") {
    return (doc as any).openrouterKey;
  }
  return null;
}
