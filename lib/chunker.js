// Shared helper: split extracted document text into overlapping chunks.
// Used by /api/upload (server-side) for Phase 1 of the RAG pipeline.
// Each chunk is ~1000 characters with 150-char overlap so no sentence
// is ever cut in half across chunk boundaries.

/**
 * Max characters per chunk.  ~1000 chars ≈ 250 tokens — small enough for
 * a retrieval model to score quickly, large enough to carry full paragraphs.
 */
const DEFAULT_CHUNK_SIZE = 2000;

/**
 * Overlap between consecutive chunks.  Ensures a fact sitting right at the
 * boundary of one chunk is fully present in the next one too.
 */
const DEFAULT_OVERLAP = 1000;

/**
 * Splits raw text into overlapping chunks without breaking words or
 * sentences in half.
 *
 * Break-point priority:
 *   1. Paragraph boundary  (\n\n)
 *   2. Sentence ending     (. | ? | ! followed by space)
 *   3. Word boundary       (space)
 *
 * @param {string}  text       - Full extracted document text.
 * @param {number} [chunkSize] - Max characters per chunk (default 1000).
 * @param {number} [overlap]   - Characters repeated between chunks (default 150).
 * @returns {Array<{ chunkIndex: number, text: string }>}
 */
export function chunkDocumentText(text, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP) {
  if (!text || typeof text !== 'string') return [];

  // 1. Normalise whitespace: collapse Windows \r\n → \n, remove triple+ newlines
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Tiny document — single chunk, no splitting needed
  if (cleanText.length <= chunkSize) {
    return [{ chunkIndex: 0, text: cleanText }];
  }

  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = Math.min(startIndex + chunkSize, cleanText.length);

    // If we haven't reached the end of the text, find a clean break point
    if (endIndex < cleanText.length) {
      const halfChunk = startIndex + Math.floor(chunkSize / 2);

      // Priority 1: paragraph break (\n\n) in the second half of the chunk
      const paragraphBreak = cleanText.lastIndexOf('\n\n', endIndex);
      if (paragraphBreak > halfChunk) {
        endIndex = paragraphBreak + 2; // include the newlines in this chunk
      } else {
        // Priority 2: sentence-ending punctuation followed by space
        const sentenceBreak = Math.max(
          cleanText.lastIndexOf('. ', endIndex),
          cleanText.lastIndexOf('? ', endIndex),
          cleanText.lastIndexOf('! ', endIndex),
        );
        if (sentenceBreak > halfChunk) {
          endIndex = sentenceBreak + 2; // include ". "
        } else {
          // Priority 3: word boundary (space)
          const spaceBreak = cleanText.lastIndexOf(' ', endIndex);
          if (spaceBreak > halfChunk) {
            endIndex = spaceBreak + 1;
          }
          // else: no good break point — hard-cut at chunkSize (rare)
        }
      }
    }

    const chunkContent = cleanText.substring(startIndex, endIndex).trim();
    if (chunkContent.length > 0) {
      chunks.push({ chunkIndex, text: chunkContent });
      chunkIndex++;
    }

    // If this chunk reached the end of the document, we're done
    if (endIndex >= cleanText.length) break;

    // Advance by (actual chunk length minus overlap).
    // Only apply overlap if there's enough remaining text to form a
    // meaningful next chunk; otherwise just stop.
    const remaining = cleanText.length - endIndex;
    if (remaining <= overlap) {
      // Remaining text is shorter than overlap — grab it as a final chunk
      const tail = cleanText.substring(endIndex - overlap).trim();
      if (tail.length > 0 && tail !== chunkContent) {
        chunks.push({ chunkIndex, text: tail });
      }
      break;
    }

    startIndex = endIndex - overlap;
  }

  return chunks;
}
