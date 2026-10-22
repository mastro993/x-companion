import { describe, expect, it } from 'vitest';
import { isXUrl, parseRequest, safeError } from './background-utils';

describe('isXUrl', () => {
  it.each<[string | undefined, boolean]>([
    ['https://x.com/home', true],
    ['https://x.com/jack/status/20', true],
    ['https://mobile.x.com/home', false],
    ['https://x.com.evil.example/', false],
    ['https://notx.com/', false],
    ['chrome://newtab/', false],
    ['not a url', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isXUrl(url)).toBe(expected);
  });
});

describe('parseRequest', () => {
  const post = { author: '@a', text: 'hi', quoted: '', images: ['alt'], truncated: false };

  const run = { type: 'run-action', action: 'polish', post, draft: 'my draft' };

  it('accepts the known shapes and drops extra fields', () => {
    expect(parseRequest({ type: 'get-status', extra: 1 })).toEqual({ type: 'get-status' });
    expect(parseRequest({ type: 'open-side-panel' })).toEqual({ type: 'open-side-panel' });
    expect(parseRequest({ ...run, extra: 1, post: { ...post, url: 'https://evil' } })).toEqual(run);
  });

  it.each([
    ['null', null],
    ['string', 'get-status'],
    ['unknown type', { type: 'set-settings' }],
    ['unknown action', { ...run, action: 'summarize' }],
    ['inherited action name', { ...run, action: 'toString' }],
    ['missing draft', { ...run, draft: undefined }],
    ['over-long draft', { ...run, draft: 'd'.repeat(8001) }],
    ['missing post', { ...run, post: undefined }],
    ['missing field', { ...run, post: { ...post, quoted: undefined } }],
    ['non-string image', { ...run, post: { ...post, images: [1] } }],
    ['non-boolean truncated', { ...run, post: { ...post, truncated: 'no' } }],
  ])('rejects %s', (_, msg) => {
    expect(parseRequest(msg)).toBeNull();
  });

  it('caps field lengths', () => {
    const req = parseRequest({
      ...run,
      post: {
        author: 'a'.repeat(150),
        text: 't'.repeat(9000),
        quoted: 'q'.repeat(9000),
        images: Array(6).fill('i'.repeat(600)),
        truncated: true,
      },
    });
    if (req?.type !== 'run-action') throw new Error('expected run-action');
    expect(req.post.author).toHaveLength(100);
    expect(req.post.text).toHaveLength(8000);
    expect(req.post.quoted).toHaveLength(8000);
    expect(req.post.images).toHaveLength(4);
    expect(req.post.images.every((alt) => alt.length === 500)).toBe(true);
  });
});

describe('safeError', () => {
  const key = 'k3y-without-a-known-prefix';
  it.each([
    ['400: Model not found', '400: Model not found'],
    [`401: bad key ${key}`, '401: bad key …'],
    ['Incorrect API key provided: sk-proj-****abcd.', 'Incorrect API key provided: …'],
    ['403: Project `proj_Ab12` cannot use model `gpt-6-luna`', '403: Project `…` cannot use model `gpt-6-luna`'],
    [
      '403: buy credits at https://console.x.ai/team/0f8fad5b-d9cb-469f-a165-70867728950e',
      '403: buy credits at https://console.x.ai/team/…',
    ],
  ])('%j -> %j', (message, expected) => expect(safeError(message, key)).toBe(expected));

  it('caps the length', () => {
    expect(safeError('x'.repeat(500), key)).toHaveLength(200);
  });
});
