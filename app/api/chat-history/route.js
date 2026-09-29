import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
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

// GET /api/chat-history - Fetch all user chats or messages for a specific chatId (?chatId=xxx)
export async function GET(req) {
  try {
    const user = await getAuthUser(req);
    const userId = user ? user.id : 'anonymous_user';
    const userEmail = user ? user.email : null;

    // Build query that matches by userId OR userEmail for maximum compatibility
    const userQuery = userEmail
      ? { $or: [{ userId: userId }, { userEmail: userEmail }] }
      : { userId: userId };

    const client = await clientPromise;
    const db = client.db('aichat');

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');

    if (chatId) {
      // Fetch messages for a specific chat thread (match by chatId + user identity)
      const messages = await db
        .collection('messages')
        .find({ chatId: chatId, ...userQuery })
        .sort({ createdAt: 1 })
        .toArray();
      return NextResponse.json({ chatId, messages });
    } else {
      // Fetch all chat threads for this user
      const chats = await db
        .collection('chats')
        .find(userQuery)
        .sort({ updatedAt: -1 })
        .toArray();
      return NextResponse.json({ chats });
    }
  } catch (error) {
    console.error('Error fetching chat history from MongoDB:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
