/**
 * Helper to generate text embeddings using OpenRouter's embeddings API.
 * Uses text-embedding-3-small (1536 dimensions) which matches MongoDB Atlas vector_index.
 */

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const BATCH_SIZE = 50;

/**
 * Generate embedding vectors for an array of strings.
 * @param {string[]} texts - Array of text strings to embed.
 * @param {string} apiKey - OpenRouter API key.
 * @returns {Promise<Array<number[]>>} Array of 1536-dimensional float arrays.
 */
export async function getEmbeddings(texts, apiKey) {
  if (!texts || texts.length === 0) return [];
  if (!apiKey) throw new Error('API key is required to generate embeddings');

  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gtis.ai',
        'X-Title': 'GTIS Embeddings Engine',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Embedding API error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from embedding API');
    }

    // Sort by index in case API returns out of order
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * Generate a single embedding vector for a query string.
 * @param {string} text - Query string.
 * @param {string} apiKey - OpenRouter API key.
 * @returns {Promise<number[]>} 1536-dimensional float array.
 */
export async function getSingleEmbedding(text, apiKey) {
  const [vec] = await getEmbeddings([text], apiKey);
  return vec;
}
