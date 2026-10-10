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
identifier (e.g. ENG-123) in your reply. Always reply in Japanese.`;

export async function POST(req: NextRequest) {
  // Read the signed, encrypted session JWT directly off the request cookies.
  // This intentionally bypasses auth.ts's `session` callback (and therefore
  // never reaches the browser) because it carries the raw Okta ID token.
  // Force the __Secure- cookie prefix explicitly: behind Amplify's
  // CloudFront/Lambda proxy, getToken()'s own https detection from the
  // request can disagree with how the cookie was actually set during
  // sign-in, causing it to look up the wrong cookie name and silently
  // return null. AUTH_URL is always https here, so this is always correct.
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.AUTH_URL?.startsWith('https://') ?? true,
  });

  if (!token?.userSubject || !token.oktaIdToken) {
    return NextResponse.json({ error: 'サインインしていません。' }, { status: 401 });
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
      { error: 'Cross App Access 経由で Taskboard のアクセストークンを取得できませんでした。' },
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

  return NextResponse.json({ reply: 'ツール呼び出しの最大ステップ数に達しました。' });
}
