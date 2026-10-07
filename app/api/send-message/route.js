import { NextResponse } from 'next/server';
import crypto from 'crypto';
import clientPromise from '../../../lib/mongodb';
import { decryptApiKey } from '../../../lib/crypto';
import { getAuthUser } from '../../../lib/authServer';
import { getText, trimHistory, sanitizeAttachments } from '../../../lib/history';
import { withTiming } from '../../../lib/withTiming';
import { retrieveRelevantChunks } from '../../../lib/chunkRetriever';

// Stored user messages are plain strings — never base64/raw file bytes
const MAX_STORED_CONTENT_CHARS = 100000;

async function handlePost(req) {
  try {
    // 1. Authenticate user via shared auth helper
    const authenticatedUser = await getAuthUser(req);

    const { chatId, model, messages, attachments, documentChunks } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    if (!authenticatedUser) {
      return NextResponse.json({ error: 'Unauthorized: You must be logged in to send messages.' }, { status: 401 });
    }

    const userId = authenticatedUser.id;
    const userEmail = authenticatedUser.email;
    const activeChatId = chatId || `chat-${Date.now()}`;

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

        // Save the user's prompt to MongoDB BEFORE calling the model, so a
        // reload mid-response never loses it
        const latestUserMsg = messages[messages.length - 1];
        const contentString = getText(latestUserMsg?.content);

        const savedContent = contentString.length > MAX_STORED_CONTENT_CHARS
          ? contentString.substring(0, MAX_STORED_CONTENT_CHARS) + '\n\n[... Document truncated for storage ...]'
          : contentString;

        let currentUploadId = null;
        let uploadedAt = null;
        if (Array.isArray(documentChunks) && documentChunks.length > 0) {
          currentUploadId = crypto.randomUUID();
          uploadedAt = new Date();
        }

        const chatSetData = {
          userId: userId,
          userEmail: userEmail,
          title: contentString.slice(0, 40) || 'New Chat',
          updatedAt: new Date(),
        };
        if (currentUploadId) {
          chatSetData.latestUploadId = currentUploadId;
        }

        // Run MongoDB writes concurrently to prevent delaying stream startup
        const dbWrites = [
          db.collection('messages').insertOne({
            chatId: activeChatId,
            userId: userId,
            userEmail: userEmail,
            role: 'user',
            content: savedContent,
            attachments: sanitizeAttachments(attachments),
            createdAt: new Date(),
          }),
          db.collection('chats').updateOne(
            { _id: activeChatId },
            {
              $set: chatSetData,
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
          ),
        ];

        // Persist RAG document chunks if the frontend sent them (first message with a file)
        if (currentUploadId) {
          const chunkDocs = documentChunks.map((c) => ({
            chatId: activeChatId,
            userId: userId,
            uploadId: currentUploadId,
            fileName: c.fileName || 'unknown',
            chunkIndex: c.chunkIndex,
            text: c.text,
            createdAt: uploadedAt, // Shared timestamp
          }));
          dbWrites.push(db.collection('document_chunks').insertMany(chunkDocs));
          console.log(`Saved ${chunkDocs.length} document chunks for chat ${activeChatId} (Upload ID: ${currentUploadId})`);
        }

        // Start the MongoDB writes in the background to avoid blocking the OpenRouter fetch
        const userWritePromise = Promise.all(dbWrites).catch(err => {
          console.error('Background MongoDB save failed:', err.message);
        });
      }
    } catch (dbErr) {
      console.error('MongoDB save of user message failed:', dbErr.message);
      return NextResponse.json(
        { error: 'Could not save your message to the chat history (database unavailable). Please check your connection and try again.' },
        { status: 502 }
      );
    }

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: 'No API key found for your account. Please contact your administrator to bind an API key.' },
        { status: 403 }
      );
    }

    // Map model selection to active OpenRouter model ID
    let openRouterModel = model || 'openai/gpt-6-luna-pro';
    // OpenRouter :batch models can only be used with asynchronous Batch API, not /chat/completions
    if (openRouterModel.includes(':batch')) {
      openRouterModel = openRouterModel.replace(':batch', '');
    }
    if (model === 'anthropic/claude-3.5-sonnet' || model === 'gtis-cyber-core') {
      openRouterModel = 'anthropic/claude-3.5-sonnet:beta';
    }

    console.log(`\n================== [CHAT REQUEST] ==================`);
    console.log(`[USER] ${userEmail || userId} | Chat: ${activeChatId}`);
    console.log(`[MAIN MODEL] Requested: "${model}" -> Upstream: "${openRouterModel}"`);

    // System prompt for Zyra - GTIS Cybersecurity AI Engine
    const systemPrompt = {
      role: 'system',
      content: `You are Zyra, an elite enterprise Cybersecurity & Threat Intelligence AI Assistant built by GTIS.
You specialize in SecOps monitoring, zero-trust architecture, incident response playbooks, CVE vulnerability analysis, cloud infrastructure hardening, and ISO 27001 / SOC 2 compliance.
Respond with high precision, clear technical depth, and clean markdown code snippets when applicable.

Format every response in clean Markdown. Start directly with the answer, no filler intro or outro. Use short paragraphs of 2-4 sentences. Use ## headings only when the answer has distinct sections, ### for subsections. Use **bold** sparingly for key terms and findings. Use '-' bullets for unordered points and '1.' for sequential steps. Use \`inline code\` for commands, file names and variables. Put multi-line code in fenced blocks with a language tag. Use a table only when comparing items across several attributes. Use > blockquotes for tips or warnings. Never wrap the whole response in a code block or quotes.`
    };

    // Never forward the full conversation: trim to a token budget server-side.
    // trimHistory keeps the system message + newest user message and strips
    // attachments/base64 from all older turns.
    const { kept, newestOverTokens } = trimHistory([systemPrompt, ...messages]);

    if (newestOverTokens) {
      return NextResponse.json(
        { error: 'That message is too large to process (over ~200k tokens). Please shorten the text or attach a smaller file, or start a new chat.' },
        { status: 413 }
      );
    }

    // RAG Retrieval: inject relevant document chunks into Zyra's context ──
    // If the user has uploaded documents in this chat, fetch chunks from MongoDB,
    // ask retriever model (deepseek/deepseek-v4.1-flash) which ones are relevant, and prepend only
    // those to the newest user message so Zyra answers from the document.
    try {
      if (process.env.MONGODB_URI) {
        const mongoClient = await clientPromise;
        const db = mongoClient.db('aichat');

        // Fetch the chat to get the latestUploadId
        const chatDoc = await db.collection('chats').findOne({ _id: activeChatId });
        const latestUploadId = chatDoc?.latestUploadId || null;

        const storedChunks = await db
          .collection('document_chunks')
          .find({ chatId: activeChatId })
          .sort({ createdAt: 1, chunkIndex: 1 })
          .toArray();

        if (storedChunks.length > 0) {
          console.log(`[RAG PIPELINE] 📄 Found ${storedChunks.length} document chunks for chat ${activeChatId}`);

          // Ask retriever model to pick the most relevant chunks
          let userQuestion = getText(messages[messages.length - 1]?.content);
          if (userQuestion.includes('\n\n[Attached ')) {
            userQuestion = userQuestion.split('\n\n[Attached ')[0].trim();
          }

          const relevantChunks = await retrieveRelevantChunks(
            userQuestion,
            storedChunks,
            effectiveApiKey,
            latestUploadId
          );

          if (relevantChunks.length > 0) {
            // Build the grounded context block
            const contextBlock = relevantChunks
              .map((c) => `[From: ${c.fileName}, Section ${c.chunkIndex}]\n${c.text}`)
              .join('\n\n---\n\n');

            const groundedPrefix = `The following verified excerpts were retrieved from the user's uploaded document(s). Answer the user's question using ONLY these excerpts. If the excerpts do not contain enough information to answer, state clearly that the uploaded document does not mention it.\n\n--- DOCUMENT EXCERPTS ---\n${contextBlock}\n--- END EXCERPTS ---\n\n`;

            // Inject the context into the newest user message in the trimmed history
            const newestIdx = kept.length - 1;
            if (newestIdx >= 0 && kept[newestIdx].role === 'user') {
              const originalContent = getText(kept[newestIdx].content);
              kept[newestIdx] = {
                ...kept[newestIdx],
                content: groundedPrefix + originalContent,
              };
            }

            console.log(`[RAG PIPELINE] 💉 Injected ${relevantChunks.length} relevant chunks into context`);
          } else {
            console.log('[RAG PIPELINE] ℹ️ Retriever found no relevant chunks for this query — proceeding without document context');
          }
        } else {
          console.log(`[RAG PIPELINE] ℹ️ No stored document chunks for chat ${activeChatId}`);
        }
      }
    } catch (ragErr) {
      // RAG is non-blocking — if it fails, Zyra still answers normally
      console.warn('[RAG PIPELINE] ⚠️ Retrieval failed (non-fatal):', ragErr.message);
    }

    console.log(`[MAIN LLM WORK] 🚀 Generating response with model: "${openRouterModel}" (stream: true)`);
    console.log(`====================================================\n`);

    // Bound the upstream call: undici fetch has no default timeout, so a DNS/network
    // stall against openrouter.ai would hang this request forever
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
        messages: kept,
        stream: true,
      }),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[MAIN LLM WORK] ❌ API Error (${response.status}) on model "${openRouterModel}":`, errText);
      return NextResponse.json({ error: `API Error (${response.status}): ${errText}` }, { status: response.status });
    }

    console.log(`[MAIN LLM WORK] ⚡ Response stream opened successfully from model "${openRouterModel}"`);

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in /api/send-message route:', error);
    const msg = error.name === 'TimeoutError'
      ? 'The AI provider did not respond within 300s (network timeout). Please try again.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withTiming('send-message', handlePost);
