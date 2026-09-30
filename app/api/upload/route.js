import { NextResponse } from 'next/server';
import { uploadFileToDrive } from '../../../lib/gdrive';
import { getAuthUser } from '../../../lib/authServer';
import { withTiming } from '../../../lib/withTiming';

// Cap on extracted document text (server-side) — keeps chats and prompts small
const MAX_EXTRACTED_CHARS = 20000;

// Server-side upload policy: 10 MB max, images (png/jpeg/webp) and PDF only
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const PDF_PARSE_TIMEOUT_MS = 60000; // 60 s

function withTimeout(promise, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), PDF_PARSE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const maxDuration = 60;

async function handlePost(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to upload files.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

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

    // Only png/jpeg/webp images and PDFs are accepted
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type (${file.type || 'unknown'}). Allowed: PNG, JPEG, WebP, PDF.` },
        { status: 400 }
      );
    }

    // ── Step 1: Extract text from PDF (independent of Google Drive) ──
    let extractedText = null;
    let pageCount = null;

    if (isPdf) {
      try {
        const pdfModule = await import('pdf-parse');
        // Handle both ESM named export and CJS default export wrapping
        const PDFParse = pdfModule.PDFParse || pdfModule.default?.PDFParse || pdfModule.default;
        
        if (!PDFParse) {
          throw new Error('PDFParse class not found in pdf-parse module');
        }

        const parser = new PDFParse({ data: buffer });
        await withTimeout(parser.load(), 'PDF parsing timed out — the file may be too large or complex');
        const result = await withTimeout(parser.getText(), 'PDF text extraction timed out — the file may be too large or complex');
        extractedText = result.text || '';
        pageCount = result.total || null;

        await parser.destroy?.();

        console.log(`PDF extracted: ${file.name} — ${pageCount} pages, ${extractedText.length} chars`);

        // Truncate extremely long documents to prevent token overflow
        if (extractedText.length > MAX_EXTRACTED_CHARS) {
          const totalLen = extractedText.length;
          extractedText = extractedText.substring(0, MAX_EXTRACTED_CHARS) +
            `\n\n[... Document truncated. Showing first ${Math.round(MAX_EXTRACTED_CHARS / 1000)}K characters of ${totalLen.toLocaleString()} total characters ...]`;
        }

        // If extraction yields very little text, the PDF may be scanned/image-based
        if (extractedText.trim().length < 50 && pageCount > 0) {
          extractedText = `[This PDF appears to be scanned or image-based (${pageCount} pages). Text extraction found minimal content. The document may contain images, charts, or scanned text that requires OCR.]`;
        }
      } catch (pdfErr) {
        console.error('PDF text extraction failed:', pdfErr);
        extractedText = '[PDF text extraction failed. The file may be corrupted, password-protected, or in an unsupported format.]';
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

    return NextResponse.json({
      success: true,
      file: driveResult,
      extractedText,
      pageCount,
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
