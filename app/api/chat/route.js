import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { model, messages, webSearch } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      // If OPENROUTER_API_KEY is not set yet, return friendly message directing user to .env.local
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is missing. Please add your key to .env.local' },
        { status: 500 }
      );
    }

    // Map model selection to OpenRouter model ID
    let openRouterModel = model || 'anthropic/claude-3.5-sonnet';
    if (model === 'gtis-cyber-core') {
      openRouterModel = 'anthropic/claude-3.5-sonnet';
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
        'Authorization': `Bearer ${apiKey}`,
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
      console.error(' Error:', errText);
      return NextResponse.json({ error: ` API Error (${response.status}): ${errText}` }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in /api/chat route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
