import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import OpenAI from 'openai';
import { getResourceAccessToken } from '@/lib/xaa/get-resource-token';
import { tools, runTool } from '@/lib/agent-tools';

let openai: OpenAI | undefined;
function getOpenAiClient(): OpenAI {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SYSTEM_PROMPT = `You are an assistant that helps the user manage their Taskboard issues.
Use the available tools to look up teams, issues, and workflow states before creating
or updating anything. Be concise. When you create or update an issue, mention its
identifier (e.g. ENG-123) in your reply.`;

export async function POST(req: NextRequest) {
  // Read the signed, encrypted session JWT directly off the request cookies.
  // This intentionally bypasses auth.ts's `session` callback (and therefore
  // never reaches the browser) because it carries the raw Okta ID token.
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token?.userSubject || !token.oktaIdToken) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { messages } = (await req.json()) as {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  };

  let resourceAccessToken: string;
  try {
    resourceAccessToken = await getResourceAccessToken(token.userSubject, token.oktaIdToken);
  } catch (error) {
    console.error('XAA token exchange failed', error);
    return NextResponse.json(
      { error: 'Could not obtain a Taskboard access token via Cross App Access.' },
      { status: 502 }
    );
  }

  const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  // Tool-calling loop: let the model request tools until it produces a final answer.
  for (let turn = 0; turn < 8; turn += 1) {
    const completion = await getOpenAiClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
      messages: conversation,
      tools,
    });

    const choice = completion.choices[0];
    const message = choice.message;
    conversation.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return NextResponse.json({ reply: message.content ?? '' });
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== 'function') continue;
      let result: unknown;
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        result = await runTool(toolCall.function.name, args, resourceAccessToken);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }

      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return NextResponse.json({ reply: 'Reached the maximum number of tool-call steps.' });
}
