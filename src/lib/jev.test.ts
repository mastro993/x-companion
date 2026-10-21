import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { decide, type JevConfig } from './jev';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch(reply: () => Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(reply()));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const cfg = (via: JevConfig['via']): JevConfig => ({ via, apiKey: 'k-123' });
const questions = {
  billing: { type: 'noul', instructions: 'Is this about billing?' },
  tone: { type: 'choice', criteria: { calm: 'A polite message', angry: null } },
  urgency: { type: 'score', criteria: ['Can wait', 'Today'] },
} as const;
const answers = {
  billing: { type: 'noul', noul: 0.98 },
  tone: { type: 'choice', choice: 'calm', confidence: 0.7, probabilities: { calm: 0.8, angry: 0.2 } },
  urgency: { type: 'score', score: 0.9, confidence: 0.5, probabilities: { '0': 0.1, '1': 0.9 } },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decide', () => {
  it.each([
    ['typesafe', 'https://api.typesafe.ai/v1/systemone'],
    ['openrouter', 'https://openrouter.ai/api/v1/systemone'],
  ] as const)('%s sends one System One request', async (via, url) => {
    // OpenRouter adds id, provider and usage.cost; both send a versioned model.
    const fn = mockFetch(() => json({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1 } }));
    await expect(decide(cfg(via), { post: 'Hi' }, questions)).resolves.toEqual(answers);

    const [reqUrl, init] = fn.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(reqUrl).toBe(url);
    expect(headers.authorization).toBe('Bearer k-123');
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'jev-latest',
      state: { post: 'Hi' },
      questions,
    });
    expect(headers['X-OpenRouter-Title']).toBe(via === 'openrouter' ? 'x-companion' : undefined);
  });

  it('types each answer by its question', async () => {
    mockFetch(() => json({ answers }));
    const res = await decide(cfg('typesafe'), 'Hi', {
      ...questions,
      stars: { type: 'choice', criteria: { 1: 'Bad', 5: { label: 'Great' } } },
    });
    expectTypeOf(res.billing.noul).toEqualTypeOf<number>();
    expectTypeOf(res.tone.choice).toEqualTypeOf<'calm' | 'angry'>();
    expectTypeOf<typeof res.stars.choice>().toEqualTypeOf<'1' | '5'>();
    expectTypeOf(res.urgency.score).toEqualTypeOf<number>();
  });

  it.each([
    [
      'TypeSafe 401',
      () => json({ detail: { error_type: 'authentication_error', message: 'Bad key' } }, 401),
      'Invalid API key',
    ],
    [
      'TypeSafe detail message',
      () => json({ detail: { error_type: 'overloaded', message: 'Overloaded' } }, 529),
      '529: Overloaded',
    ],
    ['TypeSafe 422 field list', () => json({ detail: [{ msg: 'Field required' }] }, 422), '422: Request failed'],
    ['OpenRouter 200 with error', () => json({ error: { message: 'Upstream down' } }), 'Upstream down'],
    ['no answers', () => json({ model: 'jev-1.13.0' }), 'Unexpected response'],
  ])('%s', async (_, res, message) => {
    mockFetch(res);
    await expect(decide(cfg('typesafe'), 'Hi', questions)).rejects.toThrow(message);
  });
});
