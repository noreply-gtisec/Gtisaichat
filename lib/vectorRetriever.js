import clientPromise from './mongodb';
import { getSingleEmbedding } from './embeddings';

const VECTOR_INDEX_NAME = process.env.VECTOR_INDEX_NAME || 'autoembed_index';

/**
 * Perform semantic vector search over document chunks in MongoDB Atlas.
 * 
 * @param {string} userQuery - The user's question or search query.
 * @param {string} chatId - Active chat ID.
 * @param {string} apiKey - OpenRouter API key.
 * @param {number} limit - Number of top chunks to return (default: 10).
 * @returns {Promise<Array<{ chunkIndex: number, text: string, fileName: string, score: number }>>}
 */
export async function retrieveChunksByVector(userQuery, chatId, apiKey, limit = 10) {
  if (!userQuery || !chatId || !apiKey) return [];

  try {
    const startTime = Date.now();
    const queryVector = await getSingleEmbedding(userQuery, apiKey);
    if (!queryVector || queryVector.length !== 1536) {
      console.warn('[VECTOR SEARCH] ⚠️ Failed to generate query vector');
      return [];
    }

    const client = await clientPromise;
    const db = client.db('aichat');

    const pipeline = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: queryVector,
          numCandidates: Math.max(limit * 10, 50),
          limit: limit,
          filter: {
            chatId: { $eq: chatId }
          }
        }
      },
      {
        $project: {
          _id: 1,
          chunkIndex: 1,
          text: 1,
          fileName: 1,
          uploadId: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ];

    const results = await db.collection('document_chunks').aggregate(pipeline).toArray();
    const duration = Date.now() - startTime;

    console.log(`[VECTOR SEARCH] ⚡ Atlas Vector Search returned ${results.length} chunks in ${duration}ms (top score: ${results[0]?.score?.toFixed(4) || 'N/A'})`);

    return results;
  } catch (err) {
    console.warn('[VECTOR SEARCH] ⚠️ Vector search failed (falling back):', err.message);
    return [];
  }
}
