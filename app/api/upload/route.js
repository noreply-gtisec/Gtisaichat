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
    console.error('File Upload Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
