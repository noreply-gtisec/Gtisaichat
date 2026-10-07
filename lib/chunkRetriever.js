// RAG Chunk Retriever — Phase 2 of the document Q&A pipeline.
// Uses a cheap/fast model (deepseek/deepseek-v4.1-flash via OpenRouter) to pick
// the top relevant chunks from the document_chunks collection, given the
// user's latest question.  Only the selected chunks are injected into Zyra's
// context, saving tokens and improving answer accuracy.

// Retrieve configuration from environment (with sensible defaults)
const RETRIEVER_MODEL = process.env.RETRIEVER_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_RELEVANT_CHUNKS = Number(process.env.MAX_CHUNKS_PER_QUERY) || 1000; // return at most this many chunks
const FALLBACK_CHUNKS = Number(process.env.FALLBACK_CHUNKS) || 15; // safety fallback if model returns []
const RETRIEVER_TIMEOUT_MS = Number(process.env.RETRIEVER_TIMEOUT_MS) || 15000; // 15 s default

/**
 * Ask a cheap model which document chunks are relevant to the user's question.
 *
 * @param {string}   userQuery   - The user's latest question text.
 * @param {Array}    chunks      - Array of { chunkIndex, text, fileName } from MongoDB.
 * @param {string}   apiKey      - OpenRouter API key.
 * @returns {Promise<Array<{ chunkIndex: number, text: string, fileName: string }>>}
 *          The top relevant chunks (max MAX_RELEVANT_CHUNKS).
 */
export async function retrieveRelevantChunks(userQuery, chunks, apiKey, latestUploadId) {
  if (!chunks || chunks.length === 0) return [];
  if (!userQuery || !apiKey) return [];

  // Build a numbered list of chunk previews for the model to evaluate
  const chunkList = chunks.map((c) => {
    // Truncate each chunk preview to ~1500 chars to keep the retriever prompt small
    const preview = c.text.length > 1500 ? c.text.substring(0, 1500) + '...' : c.text;
    const isLatest = latestUploadId && c.uploadId === latestUploadId;
    const label = isLatest ? `${c.fileName} - LATEST UPLOAD` : c.fileName;
    return `[Chunk ${c.chunkIndex}] (${label})\n${preview}`;
  }).join('\n\n---\n\n');

  const retrieverPrompt = `You are a document retrieval assistant. Your job is to select ALL relevant document chunks needed to fully answer the user's question.

Below are numbered document chunks extracted from the user's uploaded file(s). Read the user's question and return the chunk numbers (as a JSON array of integers) that are most relevant to answering it.

Rules:
- Return ONLY a JSON array of integers, e.g. [0, 3, 7]
- For SPECIFIC questions (e.g., "What is X?") → Return the 2-5 chunks that directly contain the answer
- For BROAD questions (e.g., "Summarize", "List all", "Overview") → Return ALL chunks needed (10, 20, 50+ chunks as needed)
- NEVER artificially limit yourself - if the question needs many chunks, return all of them
- Prioritize chunks marked as "LATEST UPLOAD" if the user's question doesn't specifically ask about an older file
- Do NOT explain your reasoning — output ONLY the JSON array

DOCUMENT CHUNKS:
${chunkList}

USER QUESTION: ${userQuery}

RELEVANT CHUNK NUMBERS (JSON array):`;

  console.log(`[RAG RETRIEVER] 🔍 Requesting chunk scoring from model: "${RETRIEVER_MODEL}" (${chunks.length} chunks candidate pool)`);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gtis.ai',
        'X-Title': 'GTIS RAG Retriever',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RETRIEVER_MODEL,
        messages: [
          { role: 'user', content: retrieverPrompt },
        ],
        temperature: 0,
        max_tokens: 2048, // Ample tokens for internal reasoning + output JSON
        stream: false,
      }),
      signal: AbortSignal.timeout(RETRIEVER_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn(`[RAG RETRIEVER] ⚠️ Model "${RETRIEVER_MODEL}" returned HTTP ${response.status}: ${errBody} — falling back to first ${FALLBACK_CHUNKS} chunks`);
      return chunks.slice(0, FALLBACK_CHUNKS);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    console.log(`[RAG RETRIEVER] 💬 Model output:`, content || '(empty)');

    // Parse the JSON array of chunk indices from the model's response
    // The model might wrap it in markdown code blocks or <think> tags, so strip those
    const cleaned = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // Strip DeepSeek reasoning tags
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let selectedIndices;
    try {
      selectedIndices = JSON.parse(cleaned);
    } catch {
      // If parsing fails, try to extract numbers from the response
      const matches = cleaned.match(/\d+/g);
      selectedIndices = matches ? matches.map(Number) : [];
    }

    if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
      console.log(`[RAG RETRIEVER] ⚠️ Model "${RETRIEVER_MODEL}" returned no chunks - using safety fallback: first ${FALLBACK_CHUNKS} chunks`);
      return chunks.slice(0, FALLBACK_CHUNKS);
    }

    // Map indices back to actual chunk objects
    const chunkMap = new Map(chunks.map((c) => [c.chunkIndex, c]));
    const selected = selectedIndices
      .slice(0, MAX_RELEVANT_CHUNKS)
      .map((idx) => chunkMap.get(idx))
      .filter(Boolean);

    console.log(`[RAG RETRIEVER] ✅ Model "${RETRIEVER_MODEL}" selected ${selected.length} chunks: [${selectedIndices.slice(0, MAX_RELEVANT_CHUNKS).join(', ')}]`);
    return selected;
  } catch (err) {
    // Timeout, network error, etc. — gracefully fall back to first N chunks
    console.warn(`[RAG RETRIEVER] ❌ Chunk retriever with model "${RETRIEVER_MODEL}" error: ${err.message}. Falling back to first ${FALLBACK_CHUNKS} chunks`);
    return chunks.slice(0, FALLBACK_CHUNKS);
  }
}
