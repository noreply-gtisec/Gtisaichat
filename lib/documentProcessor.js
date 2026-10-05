const PDF_PARSE_TIMEOUT_MS = 60000;

function withTimeout(promise, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), PDF_PARSE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const fail = (code, error) => ({ success: false, code, error, text: null, pageCount: null });

const isPasswordError = (err) =>
  err?.name === 'PasswordException' ||
  err?.code === 1 || err?.code === 2 || // pdf.js: NEED_PASSWORD / INCORRECT_PASSWORD
  /password/i.test(err?.message || '');

async function processPdf(buffer, password) {
  let parser;
  try {
    const pdfModule = await import('pdf-parse');
    const PDFParse = pdfModule.PDFParse || pdfModule.default?.PDFParse || pdfModule.default;
    if (!PDFParse) throw new Error('PDFParse class not found in pdf-parse module');

    parser = new PDFParse({ data: buffer, ...(password ? { password } : {}) });
    await withTimeout(parser.load(), 'PDF parsing timed out');
    const result = await withTimeout(parser.getText(), 'PDF text extraction timed out');
    return { success: true, text: result.text || '', pageCount: result.total || null };
  } catch (err) {
    if (isPasswordError(err)) {
      return password
        ? fail('WRONG_PASSWORD', 'The password is incorrect or the document could not be unlocked.')
        : fail('PASSWORD_REQUIRED', 'This document is password-protected. Please enter the password.');
    }
    console.error('PDF extraction failed:', err.message);
    return fail('EXTRACTION_FAILED', 'The PDF could not be read. It may be corrupted or in an unsupported format.');
  } finally {
    await parser?.destroy?.();
  }
}

async function processWord(buffer, password) {
  try {
    const mod = await import('officecrypto-tool');
    const officeCrypto = mod.default || mod;

    let buf = buffer;
    let encrypted = false;
    try { encrypted = officeCrypto.isEncrypted(buffer); } catch { encrypted = false; }

    if (encrypted) {
      if (!password) {
        return fail('PASSWORD_REQUIRED', 'This document is password-protected. Please enter the password.');
      }
      try {
        buf = await officeCrypto.decrypt(buffer, { password });
      } catch {
        return fail('WRONG_PASSWORD', 'The password is incorrect or the document could not be unlocked.');
      }
    }

    const WordExtractorModule = await import('word-extractor');
    const WordExtractor = WordExtractorModule.default || WordExtractorModule;
    const doc = await new WordExtractor().extract(buf);
    return { success: true, text: doc.getBody() || '', pageCount: null };
  } catch (err) {
    console.error('Word extraction failed:', err.message);
    return fail('EXTRACTION_FAILED', 'The Word document could not be read. It may be corrupted or use unsupported encryption.');
  }
}

export async function processDocument({ buffer, isPdf, isWord, password }) {
  if (isPdf) return processPdf(buffer, password);
  if (isWord) return processWord(buffer, password);
  return fail('UNSUPPORTED', 'Unsupported document type.');
}
