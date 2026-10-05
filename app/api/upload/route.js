import { NextResponse } from 'next/server';
import { uploadFileToDrive } from '../../../lib/gdrive';
import { getAuthUser } from '../../../lib/authServer';
import { withTiming } from '../../../lib/withTiming';
import { chunkDocumentText } from '../../../lib/chunker';
import { processDocument } from '../../../lib/documentProcessor';


// Cap on extracted document text (server-side) — keeps chats and prompts small
// Increased from 20,000 to 8,000,000 now that RAG chunking is implemented.
const MAX_EXTRACTED_CHARS = 8000000;

// Server-side upload policy: 30 MB max, images (png/jpeg/webp) and documents
const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
const ALLOWED_MIME_TYPES = [
  'image/png', 
  'image/jpeg', 
  'image/webp', 
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword' // .doc
];
export const maxDuration = 60;

async function handlePost(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to upload files.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const passwordRaw = formData.get('password');
    const password = typeof passwordRaw === 'string' && passwordRaw.length > 0 ? passwordRaw : undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isWord = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                   file.type === 'application/msword' || 
                   file.name.toLowerCase().endsWith('.docx') || 
                   file.name.toLowerCase().endsWith('.doc');

    // Only png/jpeg/webp images and documents are accepted
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !isPdf && !isWord) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type (${file.type || 'unknown'}). Allowed: PNG, JPEG, WebP, PDF, DOCX, DOC.` },
        { status: 400 }
      );
    }

    let extractedText = null;
    let pageCount = null;

    if (isPdf || isWord) {
      const doc = await processDocument({ buffer, isPdf, isWord, password });
      if (!doc.success) {
        return NextResponse.json(
          { success: false, code: doc.code, error: doc.error },
          { status: 422 }
        );
      }
      extractedText = doc.text;
      pageCount = doc.pageCount;

      if (extractedText.length > MAX_EXTRACTED_CHARS) {
        const totalLen = extractedText.length;
        extractedText = extractedText.substring(0, MAX_EXTRACTED_CHARS) +
          `\n\n[... Document truncated. Showing first ${Math.round(MAX_EXTRACTED_CHARS / 1000)}K characters of ${totalLen.toLocaleString()} total characters ...]`;
      }

      if (isPdf && extractedText.trim().length < 50 && pageCount > 0) {
        extractedText = `[This PDF appears to be scanned or image-based (${pageCount} pages). Text extraction found minimal content. The document may contain images, charts, or scanned text that requires OCR.]`;
      }
    }

    // ── Step 2: Upload to Google Drive (optional — graceful failure) ──
    let driveResult = null;

    try {
      driveResult = await uploadFileToDrive(buffer, file.name, file.type);
    } catch (driveErr) {
      console.warn('Google Drive upload skipped:', driveErr.message);
      // Not a fatal error — PDF text extraction still works without Drive
    }

    // ── Step 3: Generate document chunks for RAG retrieval ──
    // Chunks are returned to the frontend and persisted to MongoDB when the
    // user actually sends a message (at that point chatId is known).
    let chunks = [];
    if (extractedText && extractedText.trim().length >= 50) {
      chunks = chunkDocumentText(extractedText);
      console.log(`Document chunked: ${file.name} → ${chunks.length} chunks`);
    }

    return NextResponse.json({
      success: true,
      file: driveResult,
      extractedText,
      pageCount,
      chunks,
    });
  } catch (error) {
    console.error('Upload route error:', error);
    let userMsg = error.message;
    if (error.message.includes('invalid_grant') || error.message.includes('account not found')) {
      userMsg = 'Google Drive Service Account credential error (Invalid grant: account not found). Please verify GDRIVE_CLIENT_EMAIL and GDRIVE_PRIVATE_KEY in .env.local.';
    }
    return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
  }
}

export const POST = withTiming('upload', handlePost);
