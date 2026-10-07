import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const customModels = [
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA: Nemotron 3.5 Lightning (Free)', provider: 'NVIDIA' },
    { id: 'openai/gpt-6-luna-pro', name: 'OpenAI: GPT-6 Luna Pro', provider: 'OpenAI' },
    { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', provider: 'OpenAI' },
    { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek: DeepSeek V4.1 Flash', provider: 'DeepSeek' },
    { id: 'ibm-granite/granite-4.2-8b', name: 'IBM: Granite 4.2 8B', provider: 'IBM' },
    { id: 'upstage/solar-mini-4', name: 'Upstage: Solar Mini 4', provider: 'Upstage' },
    { id: 'xiaomi/mimo-v2.6-flash', name: 'Xiaomi: MiMo-V2.6-Flash', provider: 'Xiaomi' },
    { id: 'inclusionai/ling-3.0-flash-vl', name: 'inclusionAI: Ling 3.0 Flash VL', provider: 'inclusionAI' }
  ];

  return NextResponse.json(
    { models: customModels },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
