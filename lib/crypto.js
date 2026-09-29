import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.ENCRYPTION_SECRET || 'gtis-cybersecurity-secret-key-32b';
const IV_LENGTH = 16;

/**
 * Encrypts plain text API key into AES-256-CBC hex string
 */
export function encryptApiKey(text) {
  if (!text) return null;
  if (text.startsWith('enc:')) return text;

  const keyBuffer = crypto.createHash('sha256').update(SECRET_KEY).digest();
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

  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    const keyBuffer = crypto.createHash('sha256').update(SECRET_KEY).digest();
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt API key:', err.message);
    return null;
  }
}
