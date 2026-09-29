import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { getAuthUser } from '../../../lib/authServer';

// GET /api/chat-history - Fetch all user chats or messages for a specific chatId (?chatId=xxx)
export async function GET(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to view chat history.' }, { status: 401 });
    }
    const userId = user.id;
    const userEmail = user.email;

    // Build query that matches by userId OR userEmail for maximum compatibility
    const userQuery = userEmail
      ? { $or: [{ userId: userId }, { userEmail: userEmail }] }
      : { userId: userId };

    const client = await clientPromise;
    const db = client.db('aichat');

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');

    if (chatId) {
      // Fetch messages for a specific chat thread (limit to 200 most recent)
      const messages = await db
        .collection('messages')
        .find({ chatId: chatId, ...userQuery })
        .sort({ createdAt: 1 })
        .limit(200)
        .toArray();
      return NextResponse.json({ chatId, messages });
    } else {
      // Fetch the 50 most recent chat threads for this user
      const chats = await db
        .collection('chats')
        .find(userQuery)
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return NextResponse.json({ chats });
    }
  } catch (error) {
    console.error('Error fetching chat history from MongoDB:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
