import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { getAuthUser } from '../../../lib/authServer';

// POST /api/save-message - Save a single message (user or assistant) to MongoDB
export async function POST(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to save messages.' }, { status: 401 });
    }
    const userId = user.id;
    const userEmail = user.email;

    const { chatId, role, content, attachments } = await req.json();

    if (!chatId || !content) {
      return NextResponse.json({ error: 'chatId and content are required' }, { status: 400 });
    }

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ error: 'MONGODB_URI not configured' }, { status: 500 });
    }

    const client = await clientPromise;
    const db = client.db('aichat');

    // Save message into 'messages' collection
    const insertedMsg = await db.collection('messages').insertOne({
      chatId: chatId,
      userId: userId,
      userEmail: userEmail,
      role: role || 'assistant',
      content: String(content),
      attachments: attachments || [],
      createdAt: new Date(),
    });

    // Update 'chats' collection metadata
    await db.collection('chats').updateOne(
      { _id: chatId },
      {
        $set: {
          userId: userId,
          userEmail: userEmail,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          title: String(content).slice(0, 40) || 'New Security Audit',
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, messageId: insertedMsg.insertedId });
  } catch (error) {
    console.error('Error in /api/save-message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
