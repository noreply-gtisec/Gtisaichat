import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { getAuthUser } from '../../../lib/authServer';
import { getText, sanitizeAttachments } from '../../../lib/history';
import { withTiming } from '../../../lib/withTiming';

// POST /api/save-message - Save a single message (user or assistant) to MongoDB
async function handlePost(req) {
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

    // Content is stored as a plain string, capped so no message bloats the DB;
    // attachments keep metadata + short preview only (no base64, no full text)
    const cleanContent = getText(content).slice(0, 200000);
    const cleanAttachments = sanitizeAttachments(attachments);

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ error: 'MONGODB_URI not configured' }, { status: 500 });
    }

    const client = await clientPromise;
    const db = client.db('aichat');

    // Message insert and chat metadata update are independent — run in parallel
    const [insertedMsg] = await Promise.all([
      db.collection('messages').insertOne({
        chatId: chatId,
        userId: userId,
        userEmail: userEmail,
        role: role || 'assistant',
        content: cleanContent,
        attachments: cleanAttachments,
        createdAt: new Date(),
      }),
      db.collection('chats').updateOne(
        { _id: chatId },
        {
          $set: {
            userId: userId,
            userEmail: userEmail,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            title: cleanContent.slice(0, 40) || 'New Security Chat',
            createdAt: new Date(),
          },
        },
        { upsert: true }
      ),
    ]);

    return NextResponse.json({ success: true, messageId: insertedMsg.insertedId });
  } catch (error) {
    console.error('Error in /api/save-message:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withTiming('save-message', handlePost);
