import { NextResponse } from 'next/server';
import { uploadFileToDrive } from '../../../lib/gdrive';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getAuthUser(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwtToken = authHeader.substring(7);
    if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co') {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error } = await supabase.auth.getUser(jwtToken);
        if (!error && user) return user;
      } catch (e) {
        console.warn('JWT error:', e.message);
      }
    }
  }
  return null;
}

export async function POST(req) {
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
