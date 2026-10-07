'use client';

import { useState } from 'react';
import type OpenAI from 'openai';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }

      const { reply } = await response.json();
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 300,
          maxHeight: 480,
          overflowY: 'auto',
          border: '1px solid #4443',
          borderRadius: 8,
          padding: 12,
        }}
      >
        {messages.length === 0 && (
          <p style={{ opacity: 0.6 }}>
            Try: &quot;What teams do I have?&quot; or &quot;Create a bug in ENG titled login button is
            misaligned&quot;.
          </p>
        )}
        {messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div
                style={{
                  background: m.role === 'user' ? '#2563eb' : '#4443',
                  color: m.role === 'user' ? 'white' : 'inherit',
                  borderRadius: 10,
                  padding: '8px 12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
              </div>
            </div>
          ))}
        {loading && <p style={{ opacity: 0.6 }}>Thinking…</p>}
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask about your Linear issues…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #4443' }}
        />
        <button onClick={send} disabled={loading} style={{ padding: '10px 16px', borderRadius: 8 }}>
          Send
        </button>
      </div>
    </div>
  );
}
