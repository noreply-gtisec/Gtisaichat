import { NextResponse } from 'next/server';
import { uploadFileToDrive } from '../../../lib/gdrive';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const driveResult = await uploadFileToDrive(buffer, file.name, file.type);

    return NextResponse.json({
      success: true,
      file: driveResult,
    });
  } catch (error) {
    console.warn('Google Drive File Upload Notice:', error.message);
    let userMsg = error.message;
    if (error.message.includes('invalid_grant') || error.message.includes('account not found')) {
      userMsg = 'Google Drive Service Account credential error (Invalid grant: account not found). Please verify GDRIVE_CLIENT_EMAIL and GDRIVE_PRIVATE_KEY in .env.local.';
    }
    return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
  }
}
