// A thin Anthropic Messages API client for one forced-tool call — the robust way to get structured
// JSON back. Server-side only: the API key never leaves this process. No SDK dependency; uses the
// global fetch in Node 18+.
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

// system: an array of content blocks (the large, reusable catalogue block carries cache_control so a
// second call within the cache window is ~10% the input cost). Returns { input, usage }.
export async function toolCall({ apiKey, model, system, messages, tool, maxTokens = 2000, timeoutMs = 60000 }) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools: [tool], tool_choice: { type: 'tool', name: tool.name } }),
      signal: ctl.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI request timed out — try again.' : 'Could not reach the AI service.');
  } finally { clearTimeout(timer); }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || `AI service error (${res.status})`);
    e.status = res.status;
    throw e;
  }
  const block = (data.content || []).find(c => c.type === 'tool_use' && c.name === tool.name);
  if (!block) throw new Error('The AI did not return a result.');
  return { input: block.input, usage: data.usage || {} };
}
