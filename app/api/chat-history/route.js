import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { getAuthUser } from '../../../lib/authServer';
import { withTiming } from '../../../lib/withTiming';

const PAGE_SIZE = 2000;

// Heavy fields never leave the database: full extracted document text and
// any legacy base64 payloads stay server-side.
const MESSAGE_PROJECTION = {
  'attachments.textContent': 0,
  'attachments.dataUrl': 0,
  'attachments.preview': 0,
};

// GET /api/chat-history - Fetch the user's chat list, or one page of messages
// for a chat (?chatId=xxx&before=<ISO date>). User is ALWAYS taken from the session.
async function handleGet(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to view chat history.' }, { status: 401 });
    }
    // Filter strictly by the session userId (plus legacy userEmail rows)
    const userId = user.id;
    const userEmail = user.email;
    const userQuery = userEmail
      ? { $or: [{ userId: userId }, { userEmail: userEmail }] }
      : { userId: userId };

    const client = await clientPromise;
    const db = client.db('aichat');

    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    const before = searchParams.get('before'); // ISO-date cursor for older messages

    if (chatId) {
      // Fetch the page of messages BEFORE the cursor (default: newest page)
      const messageQuery = { chatId: chatId, ...userQuery };
      if (before) {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) {
          messageQuery.createdAt = { $lt: beforeDate };
        }
      }

      // Sort newest-first and fetch one extra row to detect "are there older
      // messages?" (limit+1 probe) instead of a full countDocuments scan.
      const page = await db
        .collection('messages')
        .find(messageQuery, { projection: MESSAGE_PROJECTION })
        .sort({ createdAt: -1 })
        .limit(PAGE_SIZE + 1)
        .toArray();

      const hasMore = page.length > PAGE_SIZE;
      const messages = hasMore ? page.slice(0, PAGE_SIZE) : page;

      return NextResponse.json({ chatId, messages, hasMore, oldestDate: messages[messages.length - 1]?.createdAt });
    } else {
      // Chat list only — ids/titles/timestamps, never message bodies
      const chats = await db
        .collection('chats')
        .find(userQuery, { projection: { _id: 1, title: 1, updatedAt: 1, createdAt: 1 } })
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

export const GET = withTiming('chat-history', handleGet);
