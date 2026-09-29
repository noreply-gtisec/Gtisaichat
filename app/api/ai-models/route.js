import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'HTTP-Referer': 'https://gtis.ai',
        'X-Title': 'GTIS Cybersecurity AI Engine',
      },
      next: { revalidate: 3600 }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        const formattedModels = data.data.map((m) => {
          const isFree = m.id.includes(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
          return {
            id: m.id,
            name: `${isFree ? '🎁 [FREE] ' : ''}${m.name || m.id}`,
            description: m.description || `Context: ${m.context_length || 'N/A'} tokens`,
            provider: m.id.split('/')[0] || 'OpenRouter',
            isFree: isFree,
          };
        });

        formattedModels.sort((a, b) => (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0));
        return NextResponse.json({ models: formattedModels });
      }
    }
  } catch (err) {
    console.warn('Could not fetch live OpenRouter models list, using fallback:', err);
  }

  const fallbackModels = [
    { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', provider: 'Google' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek: DeepSeek R1 Reasoning', provider: 'DeepSeek' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta: Llama 3.3 70B', provider: 'Meta' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet', provider: 'Anthropic' },
    { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o', provider: 'OpenAI' },
    { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', provider: 'OpenAI' },
  ];

  return NextResponse.json({ models: fallbackModels });
}
