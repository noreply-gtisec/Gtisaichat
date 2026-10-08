// RAG Chunk Retriever — Document Q&A pipeline (NO embeddings needed!)
// Uses a cheap/fast model (deepseek/deepseek-v4.1-flash via OpenRouter) to pick
// the top relevant chunks from all available chunks.

// Retrieve configuration from environment (with sensible defaults)
const RETRIEVER_MODEL = process.env.RETRIEVER_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_RELEVANT_CHUNKS = Number(process.env.MAX_CHUNKS_PER_QUERY) || 1000;
const FALLBACK_CHUNKS = Number(process.env.FALLBACK_CHUNKS) || 15;
const RETRIEVER_TIMEOUT_MS = Number(process.env.RETRIEVER_TIMEOUT_MS) || 15000;

/**
 * Ask a cheap LLM which document chunks are relevant to the user's question.
 *
 * @param {string}   userQuery   - The user's latest question text.
 * @param {Array}    chunks      - Array of { chunkIndex, text, fileName } from MongoDB.
 * @param {string}   apiKey      - OpenRouter API key.
 * @param {string}   latestUploadId - ID of most recent upload (optional).
 * @returns {Promise<Array<{ chunkIndex: number, text: string, fileName: string }>>}
 */
export async function retrieveRelevantChunks(userQuery, chunks, apiKey, latestUploadId) {
  if (!chunks || chunks.length === 0) {
    console.warn('[RAG RETRIEVER] ⚠️ No chunks found in database - cannot retrieve relevant chunks');
    return [];
  }
  if (!userQuery || !apiKey) {
    console.warn('[RAG RETRIEVER] ⚠️ Missing userQuery or apiKey - cannot retrieve relevant chunks');
    return [];
  }

  // Build a numbered list of chunk previews for the model to evaluate
  const chunkList = chunks.map((c) => {
    let preview = c.text;
    if (c.text.length > 1500) {
      preview = c.text.substring(0, 1500);
      const lastSpace = preview.lastIndexOf(' ');
      if (lastSpace > 1400) {
        preview = preview.substring(0, lastSpace);
      }
      preview += '...';
    }
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

  console.log(`[RAG RETRIEVER] 🔍 Requesting chunk scoring from model: "${RETRIEVER_MODEL}" (${chunks.length} chunks)`);

  // Retry logic with exponential backoff
  const MAX_RETRIES = 2;
  let response;
  
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            max_tokens: 2048,
            stream: false,
          }),
          signal: AbortSignal.timeout(RETRIEVER_TIMEOUT_MS),
        });

        if (response.ok) {
          break;
        }

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[RAG RETRIEVER] ⚠️ Rate limited (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (attempt === MAX_RETRIES) {
          const errBody = await response.text().catch(() => '');
          console.warn(`[RAG RETRIEVER] ⚠️ Model "${RETRIEVER_MODEL}" returned HTTP ${response.status} after ${MAX_RETRIES} retries: ${errBody} — falling back to first ${FALLBACK_CHUNKS} chunks`);
          return chunks.slice(0, FALLBACK_CHUNKS);
        }
      } catch (fetchErr) {
        if (attempt < MAX_RETRIES) {
          const delay = 500 * (attempt + 1);
          console.warn(`[RAG RETRIEVER] ⚠️ Network error: ${fetchErr.message}, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw fetchErr;
      }
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    console.log(`[RAG RETRIEVER] 💬 Model output:`, content || '(empty)');

    // Parse the JSON array of chunk indices
    const cleaned = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let selectedIndices;
    try {
      selectedIndices = JSON.parse(cleaned);
    } catch {
      const matches = cleaned.match(/\d+/g);
      selectedIndices = matches ? matches.map(Number) : [];
    }

    if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) {
      console.log(`[RAG RETRIEVER] ⚠️ Model "${RETRIEVER_MODEL}" returned no chunks - using safety fallback: first ${FALLBACK_CHUNKS} chunks`);
      return chunks.slice(0, FALLBACK_CHUNKS);
    }

    // Map indices back to actual chunk objects
    const chunkMap = new Map(chunks.map((c) => [c.chunkIndex, c]));
    
    const uniqueSortedIndices = [...new Set(selectedIndices)]
      .sort((a, b) => a - b)
      .slice(0, MAX_RELEVANT_CHUNKS);
    
    const selected = [];
    let invalidCount = 0;
    
    for (const idx of uniqueSortedIndices) {
      const chunk = chunkMap.get(idx);
      if (chunk) {
        selected.push(chunk);
      } else {
        invalidCount++;
      }
    }
    
    if (invalidCount > 0) {
      console.warn(`[RAG RETRIEVER] ⚠️ Model returned ${invalidCount} invalid chunk indices - skipped`);
    }

    console.log(`[RAG RETRIEVER] ✅ Model "${RETRIEVER_MODEL}" selected ${selected.length} chunks: [${selected.slice(0, 20).map(c => c.chunkIndex).join(', ')}${selected.length > 20 ? '...' : ''}]`);
    return selected;
  } catch (err) {
    console.warn(`[RAG RETRIEVER] ❌ Chunk retriever with model "${RETRIEVER_MODEL}" error: ${err.message}. Falling back to first ${FALLBACK_CHUNKS} chunks`);
    return chunks.slice(0, FALLBACK_CHUNKS);
  }
}
