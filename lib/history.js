// Shared helpers for keeping chat payloads small.
// Used by /api/send-message (server-side trimming) and scripts/cleanup-messages.js.

// ~60K tokens budget for the whole trimmed history (tokens ≈ chars / 4)
export const MAX_HISTORY_TOKENS = 60000;
// A single newest message above this is unrecoverable — reject with HTTP 413
export const MAX_SINGLE_MESSAGE_TOKENS = 200000;
// Extracted-text preview stored per attachment
export const MAX_ATTACHMENT_PREVIEW_CHARS = 20000;

const ATTACHMENT_OMITTED_NOTE = '\n[attachment omitted]';

// Safely flatten any message content shape (string, [{type:'text'}], {text}, null) to a string.
// Never throws and never returns base64 image data.
export function getText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && part.type === 'text' && typeof part.text === 'string') return part.text;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    try {
      return JSON.stringify(content) || '';
    } catch {
      return String(content);
    }
  }
  return String(content);
}

const estTokens = (str) => Math.ceil((str || '').length / 4);

// Replace base64 / file payloads in a message so old turns carry text only.
// keepFiles=true is used only for the newest message (the one allowed to carry images).
function stripFileData(msg, keepFiles = false) {
  if (Array.isArray(msg.content)) {
    if (keepFiles) return msg; // newest turn may keep multimodal parts as-is
    const textOnly = msg.content
      .filter((part) => part && (part.type === 'text' || typeof part === 'string'))
      .map((part) => (typeof part === 'string' ? part : part.text || ''))
      .join('\n');
    return { ...msg, content: `${textOnly}${ATTACHMENT_OMITTED_NOTE}` };
  }
  const text = getText(msg.content);
  if (/^data:/i.test(text)) {
    return { ...msg, content: ATTACHMENT_OMITTED_NOTE.trim() };
  }
  return msg;
}

/**
 * Walk from newest to oldest keeping whole turns until the budget is hit.
 * Always keeps the system message and the newest user message (may exceed budget).
 * Attachments/base64 are stripped from every OLD message — only the newest may carry files.
 * Returns { kept, newestOverTokens } — caller rejects with 413 when newestOverTokens is true.
 */
export function trimHistory(messages, maxTokens = MAX_HISTORY_TOKENS) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const conversation = messages.filter((m) => m.role !== 'system');
  const newest = conversation[conversation.length - 1];
  if (!newest) return { kept: systemMsg ? [systemMsg] : [], newestOverTokens: false };

  const newestTokens = estTokens(getText(newest.content));
  if (newestTokens > MAX_SINGLE_MESSAGE_TOKENS) {
    return { kept: [], newestOverTokens: true };
  }

  const newestStripped = stripFileData(newest, true); // only the newest may carry files
  let total = (systemMsg ? estTokens(systemMsg.content) : 0) + newestTokens;
  const middle = [];

  for (let i = conversation.length - 2; i >= 0; i--) {
    const stripped = stripFileData(conversation[i]);
    const t = estTokens(getText(stripped.content));
    if (total + t > maxTokens) break; // drop the rest of the older history
    middle.unshift(stripped);
    total += t;
  }

  const kept = [
    ...(systemMsg ? [systemMsg] : []),
    ...middle,
    newestStripped,
  ];
  return { kept, newestOverTokens: false };
}

/**
 * Reduce client-sent attachments to persistable metadata:
 * name, mime, size, drive links, page count and a short extracted-text preview.
 * Base64 (dataUrl) and full document text are never stored.
 */
export function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att) => {
    if (!att || typeof att !== 'object') return { name: String(att || 'file') };
    const preview = typeof att.textContent === 'string'
      ? att.textContent.slice(0, MAX_ATTACHMENT_PREVIEW_CHARS)
      : undefined;
    const meta = {
      name: typeof att.name === 'string' ? att.name : 'file',
      mime: att.type || att.mime || null,
      size: att.size ?? null,
      isImage: !!att.isImage,
      isPdf: !!att.isPdf,
      pageCount: att.pageCount ?? null,
      driveUrl: att.driveUrl || null,
      driveFileId: att.driveFileId || null,
    };
    if (preview) meta.preview = preview;
    return meta;
  });
}
