import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText, listModels, type LlmConfig } from './llm';
import type { ProviderId } from './providers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stubs fetch; `reply` maps a URL to the response. Returns the mock for call inspection. */
function mockFetch(reply: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string, _init?: RequestInit) => Promise.resolve(reply(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const call = (fn: ReturnType<typeof mockFetch>, i = 0) => {
  const [url, init] = fn.mock.calls[i]!;
  return {
    url,
    headers: init?.headers as Record<string, string>,
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  };
};

const cfg = (provider: ProviderId, lowEffort = true): LlmConfig => ({
  provider,
  apiKey: 'k-123',
  model: { id: 'm-1', label: 'M 1', lowEffort },
});
const prompt = { system: 'SYS', user: 'USER' };
const chatOk = (content: string | null, finish_reason = 'stop') =>
  json({ choices: [{ finish_reason, message: { content } }] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateText request shape', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1/chat/completions', 'max_completion_tokens'],
    ['xai', 'https://api.x.ai/v1/chat/completions', 'max_completion_tokens'],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions', 'max_tokens'],
  ] as const)('%s uses Chat Completions', async (provider, url, capField) => {
    const fn = mockFetch(() => chatOk('Nice take'));
    await expect(generateText(cfg(provider), prompt)).resolves.toBe('Nice take');

    const req = call(fn);
    expect(req.url).toBe(url);
    expect(req.headers.authorization).toBe('Bearer k-123');
    expect(req.body).toEqual({
      model: 'm-1',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
      [capField]: 2048,
      reasoning_effort: 'low',
      ...(provider === 'openai' && { store: false }),
    });
    expect(fn.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    if (provider === 'openrouter') {
      expect(req.headers['X-OpenRouter-Title']).toBe('x-companion');
      expect(req.headers['HTTP-Referer']).toMatch(/^https:\/\//);
    }
  });

  it('anthropic uses Messages and joins only text blocks', async () => {
    const fn = mockFetch(() =>
      json({
        stop_reason: 'end_turn',
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'there' },
        ],
      }),
    );
    await expect(generateText(cfg('anthropic'), prompt)).resolves.toBe('Hello there');

    const req = call(fn);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toMatchObject({
      'x-api-key': 'k-123',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(req.body).toEqual({
      model: 'm-1',
      max_tokens: 2048,
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
      output_config: { effort: 'low' },
    });
  });

  it.each(['openai', 'anthropic'] as const)('%s omits effort when the model lacks low', async (p) => {
    const fn = mockFetch(() =>
      p === 'anthropic' ? json({ content: [{ type: 'text', text: 'ok' }] }) : chatOk('ok'),
    );
    await generateText(cfg(p, false), prompt);
    const { body } = call(fn);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('output_config');
    expect(body).not.toHaveProperty('temperature');
  });
});

describe('generateText errors', () => {
  it.each<[string, ProviderId, () => Response, string]>([
    ['401', 'openai', () => json({ error: { message: 'Incorrect API key' } }, 401), 'Invalid API key'],
    [
      'xAI 400 bad key',
      'xai',
      () => json({ code: 'invalid-argument', error: 'Incorrect API key provided.' }, 400),
      'Invalid API key',
    ],
    [
      'xAI 400 other',
      'xai',
      () => json({ code: 'invalid-argument', error: 'Model not found' }, 400),
      '400: Model not found',
    ],
    ['402', 'openrouter', () => json({ error: { message: 'Insufficient credits', code: 402 } }, 402), 'Out of credits'],
    ['429', 'anthropic', () => json({ type: 'error', error: { message: 'slow down' } }, 429), 'Rate limit'],
    ['5xx non-JSON', 'openai', () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }), '502: Bad Gateway'],
    ['200 with top-level error', 'openrouter', () => json({ error: { message: 'Upstream down', code: 502 } }), 'Upstream down'],
    [
      'OpenRouter 200 with choices[0].error and partial content',
      'openrouter',
      () =>
        json({
          choices: [
            { finish_reason: 'error', error: { message: 'Provider disconnected' }, message: { content: 'Half a rep' } },
          ],
        }),
      'Provider disconnected',
    ],
    ['chat truncation', 'xai', () => chatOk('Cut mid', 'length'), 'cut off'],
    ['anthropic truncation', 'anthropic', () => json({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Cut' }] }), 'cut off'],
    ['openai refusal', 'openai', () => json({ choices: [{ message: { content: null, refusal: 'No.' } }] }), 'declined'],
    ['anthropic refusal', 'anthropic', () => json({ stop_reason: 'refusal', content: [] }), 'declined'],
    ['empty content', 'openai', () => chatOk('  '), 'empty reply'],
  ])('%s', async (_, provider, res, message) => {
    mockFetch(res);
    await expect(generateText(cfg(provider), prompt)).rejects.toThrow(message);
  });

  it('maps a timeout to a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(generateText(cfg('openai'), prompt)).rejects.toThrow(
      'The model took too long. Try a faster model.',
    );
  });

  it('maps a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(generateText(cfg('anthropic'), prompt)).rejects.toThrow('Network error');
  });
});

describe('listModels', () => {
  it('openai keeps GPT-5+ text models, all low effort', async () => {
    const ids = ['gpt-6-luna', 'gpt-4o', 'text-embedding-3-small', 'gpt-6-sol-2026-09-22', 'gpt-realtime-2', 'gpt-5-pro', 'gpt-image-2', 'gpt-5-mini', 'gpt-5-codex', 'gpt-5-chat-latest', 'gpt-6.1-sol'];
    const fn = mockFetch(() => json({ object: 'list', data: ids.map((id) => ({ id, object: 'model' })) }));
    const models = await listModels('openai', 'k');
    expect(call(fn).url).toBe('https://api.openai.com/v1/models');
    expect(models.map((m) => m.id)).toEqual(['gpt-5-mini', 'gpt-6-luna', 'gpt-6.1-sol']);
    expect(models.every((m) => m.lowEffort)).toBe(true);
  });

  it('xai reads language-models capabilities, falling back to the id', async () => {
    const fn = mockFetch(() =>
      json({
        models: [
          { id: 'grok-4.7', output_modalities: ['text'], capabilities: { reasoning_effort: ['low', 'high'] } },
          { id: 'grok-4.3', output_modalities: ['text'] },
          { id: 'grok-4.20-0309-non-reasoning', output_modalities: ['text'] },
          { id: 'grok-x-high-only', output_modalities: ['text'], capabilities: { reasoning_effort: ['high'] } },
          { id: 'grok-4.20-multi-agent-0309', output_modalities: ['text'] },
        ],
      }),
    );
    const models = await listModels('xai', 'k');
    expect(call(fn).url).toBe('https://api.x.ai/v1/language-models');
    expect(models).toEqual([
      { id: 'grok-4.3', label: 'grok-4.3', lowEffort: true },
      { id: 'grok-4.7', label: 'grok-4.7', lowEffort: true },
      { id: 'grok-4.20-0309-non-reasoning', label: 'grok-4.20-0309-non-reasoning', lowEffort: false },
      { id: 'grok-x-high-only', label: 'grok-x-high-only', lowEffort: false },
    ]);
  });

  it('openrouter validates via /key and keeps text-only, non-batch models', async () => {
    const text = { output_modalities: ['text'] };
    const fn = mockFetch((url) =>
      url.endsWith('/key')
        ? json({ data: { usage: 0, limit_remaining: null } })
        : json({
            data: [
              { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', architecture: text, reasoning: { supported_efforts: ['high', 'low', 'none'] } },
              { id: 'anthropic/claude-haiku-5.5:batch', name: 'Batch', architecture: text, reasoning: { supported_efforts: ['low'] } },
              { id: 'google/image-gen', name: 'Image', architecture: { output_modalities: ['image', 'text'] } },
              { id: 'mistralai/mistral-large-4-0', name: 'Mistral: Large 4', architecture: text, reasoning: { supported_efforts: ['high', 'none'] } },
              { id: 'anthropic/claude-haiku-4.5', name: 'Anthropic: Claude Haiku 4.5', architecture: text, reasoning: { mandatory: false } },
            ],
          }),
    );
    const models = await listModels('openrouter', 'k');
    expect(fn.mock.calls.map(([u]) => u).sort()).toEqual([
      'https://openrouter.ai/api/v1/key',
      'https://openrouter.ai/api/v1/models',
    ]);
    expect(models).toEqual([
      { id: 'anthropic/claude-haiku-4.5', label: 'Anthropic: Claude Haiku 4.5', lowEffort: false },
      { id: 'anthropic/claude-haiku-5.5', label: 'Anthropic: Claude Haiku 5.5', lowEffort: true },
      { id: 'mistralai/mistral-large-4-0', label: 'Mistral: Large 4', lowEffort: false },
    ]);
  });

  it('openrouter rejects a bad key even though /models is public', async () => {
    mockFetch((url) =>
      url.endsWith('/key') ? json({ error: { message: 'User not found.', code: 401 } }, 401) : json({ data: [] }),
    );
    await expect(listModels('openrouter', 'k')).rejects.toThrow('Invalid API key');
  });

  it('anthropic lists active models and gates effort on capabilities', async () => {
    const fn = mockFetch(() =>
      json({
        data: [
          { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', capabilities: { effort: { supported: true, low: { supported: true } } } },
          { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', capabilities: { effort: { supported: false, low: { supported: false } } } },
          { id: 'claude-legacy', display_name: 'Claude Legacy', capabilities: null },
        ],
        has_more: false,
      }),
    );
    const models = await listModels('anthropic', 'k');
    const url = new URL(call(fn).url);
    expect(url.origin + url.pathname).toBe('https://api.anthropic.com/v1/models');
    expect(url.searchParams.get('limit')).toBe('1000');
    expect(url.searchParams.getAll('lifecycle[]')).toEqual(['active']);
    expect(call(fn).headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(models).toEqual([
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', lowEffort: false },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', lowEffort: true },
      { id: 'claude-legacy', label: 'Claude Legacy', lowEffort: false },
    ]);
  });
});
