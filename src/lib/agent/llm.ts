/** DeepSeek via its OpenAI-compatible chat completions API, with plain fetch (no SDK dependency). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export type Llm = (messages: ChatMessage[], tools: readonly unknown[], timeoutMs?: number) => Promise<ChatMessage>;

export const deepseek: Llm = async (messages, tools, timeoutMs = 25_000) => {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  const res = await fetch(`${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.KITTY_AGENT_MODEL || 'deepseek-flash',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      // Both DeepSeek models on this account reason before answering; a small budget can be spent entirely on
      // reasoning (seen live: finish_reason "length", empty content). Leave room for the answer.
      max_tokens: 3000,
    }),
    signal: AbortSignal.timeout(Math.max(3_000, timeoutMs)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  const msg = body.choices?.[0]?.message;
  if (!msg) throw new Error('DeepSeek returned no message');
  return { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls?.length ? msg.tool_calls : undefined };
};
