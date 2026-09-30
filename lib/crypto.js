import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// The encryption secret lives ONLY in the environment — there is deliberately
// no hardcoded fallback. If it's missing we fail loudly instead of silently
// encrypting with a key that is published in the repo.
function getKeyBuffer() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET is not configured in the environment. Refusing to encrypt/decrypt API keys without it.'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plain text API key into AES-256-CBC hex string
 */
export function encryptApiKey(text) {
  if (!text) return null;
  if (text.startsWith('enc:')) return text;

  const keyBuffer = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-CBC encrypted API key back to plain text
 */
export function decryptApiKey(encryptedText) {
  if (!encryptedText) return null;
  if (!encryptedText.startsWith('enc:')) return encryptedText;

  // Config error must surface loudly (do not swallow it as "could not decrypt")
  const keyBuffer = getKeyBuffer();

  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt API key:', err.message);
    return null;
  }
}
