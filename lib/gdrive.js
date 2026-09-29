import { google } from 'googleapis';
import { Readable } from 'stream';

// Fail fast instead of hanging forever when Drive/network is unreachable
const DRIVE_TIMEOUT_MS = 45000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Google Drive ${label} timed out after ${DRIVE_TIMEOUT_MS / 1000}s`)),
      DRIVE_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Helper to upload a file buffer directly to Google Drive via Service Account
 */
export async function uploadFileToDrive(fileBuffer, fileName, mimeType) {
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL || process.env.GOOGLE_DRIVE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GDRIVE_PRIVATE_KEY || process.env.GOOGLE_DRIVE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
  const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : null;
  const folderId = process.env.GDRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Drive Service Account credentials (GDRIVE_CLIENT_EMAIL / GDRIVE_PRIVATE_KEY) are missing in .env.local');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const fileMetadata = {
    name: fileName,
    parents: folderId && folderId !== 'your_google_drive_folder_id' ? [folderId] : [],
  };

  const media = {
    mimeType: mimeType || 'application/octet-stream',
    body: stream,
  };

  // AbortSignal cancels the underlying HTTP request if it stalls
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRIVE_TIMEOUT_MS);

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, mimeType, webViewLink, webContentLink',
    supportsAllDrives: true,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  // Make the file viewable via link
  try {
    await withTimeout(drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    }), 'permission grant');
  } catch (permErr) {
    console.warn('Could not set permissions for uploaded file:', permErr.message);
  }

  return {
    driveFileId: response.data.id,
    fileName: response.data.name,
    mimeType: response.data.mimeType,
    fileUrl: response.data.webViewLink,
    downloadUrl: response.data.webContentLink,
  };
}
