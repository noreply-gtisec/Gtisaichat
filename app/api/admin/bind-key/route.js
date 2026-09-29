import { NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';
import { encryptApiKey } from '../../../../lib/crypto';

// POST /api/admin/bind-key
// Body: { userId or email, apiKey }
export async function POST(req) {
  try {
    const { userId, email, apiKey } = await req.json();

    if ((!userId && !email) || !apiKey) {
      return NextResponse.json(
        { error: 'Provide either userId or email, along with apiKey.' },
        { status: 400 }
      );
    }

    const encryptedKey = encryptApiKey(apiKey);

    const client = await clientPromise;
    const db = client.db('aichat');

    const filter = userId ? { userId } : { email };
    const updateDoc = {
      $set: {
        userId,
        email,
        apiKey: encryptedKey,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    };

    await db.collection('users').updateOne(filter, updateDoc, { upsert: true });

    return NextResponse.json({
      success: true,
      message: `API key successfully encrypted and bound to user (${email || userId})`,
    });
  } catch (error) {
    console.error('Error binding user key:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
