import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import clientPromise from '../../../lib/mongodb';
import { decryptApiKey } from '../../../lib/crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(req) {
  try {
    // 1. Read Authorization header (Bearer JWT)
    const authHeader = req.headers.get('authorization');
    let authenticatedUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwtToken = authHeader.substring(7);
      if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'https://placeholder.supabase.co') {
        try {
          const supabase = createClient(supabaseUrl, supabaseAnonKey);
          const { data: { user }, error } = await supabase.auth.getUser(jwtToken);
          if (!error && user) {
            authenticatedUser = user;
          }
        } catch (e) {
          console.warn('JWT Verification error:', e.message);
        }
      }
    }

    const { chatId, model, messages, attachments } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!authenticatedUser) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to send messages.' }, { status: 401 });
    }

    const userId = authenticatedUser.id;
    const userEmail = authenticatedUser.email;

    // 2. Lookup per-user API Key from MongoDB (no fallback — each user must have their own key)
    let effectiveApiKey = null;

    try {
      if (process.env.MONGODB_URI) {
        const mongoClient = await clientPromise;
        const db = mongoClient.db('aichat');

        // Look up user by userId or email to find their unique API key
        const userQuery = userEmail ? { $or: [{ userId: userId }, { email: userEmail }] } : { userId: userId };
        const userDoc = await db.collection('users').findOne(userQuery);

        if (userDoc && userDoc.apiKey) {
          const decrypted = decryptApiKey(userDoc.apiKey);
          if (decrypted) {
            effectiveApiKey = decrypted;
          }
        }

        // Save User's latest prompt to MongoDB history
        const activeChatId = chatId || `chat-${Date.now()}`;
        const latestUserMsg = messages[messages.length - 1];
        let contentString = '';
        const rawContent = latestUserMsg?.content;
        if (typeof rawContent === 'string') {
          contentString = rawContent;
        } else if (Array.isArray(rawContent)) {
          const textObj = rawContent.find((item) => item && (item.text || typeof item === 'string'));
          if (textObj) contentString = textObj.text || String(textObj);
        } else if (typeof rawContent === 'object' && rawContent?.text) {
          contentString = rawContent.text;
        }

        await db.collection('messages').insertOne({
          chatId: activeChatId,
          userId: userId,
          userEmail: userEmail,
          role: 'user',
          content: contentString,
          attachments: attachments || [],
          createdAt: new Date(),
        });

        let titleString = contentString || 'New Audit';
        if (typeof rawContent === 'string') {
          titleString = rawContent;
        } else if (Array.isArray(rawContent)) {
          const textObj = rawContent.find((item) => item && (item.text || typeof item === 'string'));
          if (textObj) titleString = textObj.text || String(textObj);
        } else if (typeof rawContent === 'object' && rawContent?.text) {
          titleString = rawContent.text;
        }

        // Update Chat metadata
        await db.collection('chats').updateOne(
          { _id: activeChatId },
          {
            $set: {
              userId: userId,
              userEmail: userEmail,
              title: String(titleString).slice(0, 40),
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        );
      }
    } catch (dbErr) {
      console.warn('MongoDB chat log warning (non-fatal):', dbErr.message);
    }

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: 'No API key found for your account. Please contact your administrator to bind an API key.' },
        { status: 403 }
      );
    }

    // Map model selection to active OpenRouter model ID
    let openRouterModel = model || 'anthropic/claude-3.5-sonnet:beta';
    if (model === 'anthropic/claude-3.5-sonnet' || model === 'gtis-cyber-core') {
      openRouterModel = 'anthropic/claude-3.5-sonnet:beta';
    }

    // System prompt for GTIS Cybersecurity AI Engine
    const systemPrompt = {
      role: 'system',
      content: `You are GTIS AI Engine, an elite enterprise Cybersecurity & Threat Intelligence AI Assistant.
You specialize in SecOps monitoring, zero-trust architecture, incident response playbooks, CVE vulnerability analysis, cloud infrastructure hardening, and ISO 27001 / SOC 2 compliance.
Respond with high precision, clear technical depth, and clean markdown code snippets when applicable.`
    };

    const formattedMessages = [systemPrompt, ...messages];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${effectiveApiKey}`,
        'HTTP-Referer': 'https://gtis.ai',
        'X-Title': 'GTIS Cybersecurity AI Engine',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: formattedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('API Error:', errText);
      return NextResponse.json({ error: `API Error (${response.status}): ${errText}` }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in /api/send-message route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
