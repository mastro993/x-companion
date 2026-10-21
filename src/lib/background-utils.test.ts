import { describe, expect, it } from 'vitest';
import { isXUrl, parseRequest } from './background-utils';

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

  it('accepts the known shapes and drops extra fields', () => {
    expect(parseRequest({ type: 'get-status', extra: 1 })).toEqual({ type: 'get-status' });
    expect(parseRequest({ type: 'open-side-panel' })).toEqual({ type: 'open-side-panel' });
    expect(parseRequest({ type: 'generate-reply', post: { ...post, url: 'https://evil' } })).toEqual({
      type: 'generate-reply',
      post,
    });
  });

  it.each([
    ['null', null],
    ['string', 'get-status'],
    ['unknown type', { type: 'set-settings' }],
    ['missing post', { type: 'generate-reply' }],
    ['missing field', { type: 'generate-reply', post: { ...post, quoted: undefined } }],
    ['non-string image', { type: 'generate-reply', post: { ...post, images: [1] } }],
    ['non-boolean truncated', { type: 'generate-reply', post: { ...post, truncated: 'no' } }],
  ])('rejects %s', (_, msg) => {
    expect(parseRequest(msg)).toBeNull();
  });

  it('caps field lengths', () => {
    const req = parseRequest({
      type: 'generate-reply',
      post: {
        author: 'a'.repeat(150),
        text: 't'.repeat(9000),
        quoted: 'q'.repeat(9000),
        images: Array(6).fill('i'.repeat(600)),
        truncated: true,
      },
    });
    if (req?.type !== 'generate-reply') throw new Error('expected generate-reply');
    expect(req.post.author).toHaveLength(100);
    expect(req.post.text).toHaveLength(8000);
    expect(req.post.quoted).toHaveLength(8000);
    expect(req.post.images).toHaveLength(4);
    expect(req.post.images.every((alt) => alt.length === 500)).toBe(true);
  });
});
