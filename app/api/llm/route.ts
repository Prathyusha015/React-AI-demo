export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, provider = 'ondevice', model } = body;

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // If on-device, return null to use local processing
    if (provider === 'ondevice') {
      return NextResponse.json({ 
        provider: 'ondevice',
        message: 'Using on-device LLM (handled by server-side processors)'
      });
    }

    // Use OpenRouter API
    if (provider === 'openrouter') {
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) {
        return NextResponse.json({ 
          error: 'OpenRouter API key not configured. Set OPENROUTER_API_KEY in environment variables.' 
        }, { status: 500 });
      }

      // Default model if not specified
      const selectedModel = model || 'openai/gpt-3.5-turbo';

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'AI Dashboard',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that provides concise summaries and key insights. Keep responses brief and focused.'
              },
              {
                role: 'user',
                content: `Please provide a concise summary of the following text:\n\n${text.substring(0, 8000)}`
              }
            ],
            max_tokens: 300,
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content || 'Summary generation failed';

        return NextResponse.json({
          provider: 'openrouter',
          summary,
          model: selectedModel,
          usage: data.usage,
        });
      } catch (error: any) {
        console.error('OpenRouter API error:', error);
        return NextResponse.json({ 
          error: error?.message || 'Failed to call OpenRouter API' 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}







