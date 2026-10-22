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
  const image = { url: 'https://pbs.twimg.com/media/A?format=jpg&name=medium', alt: 'A cat', video: false };
  const quoted = { author: '@q', text: 'quoted', images: [image], truncated: false, quoted: null };
  const one = { author: '@a', text: 'hi', images: [image], truncated: false, quoted };
  const post = { ...one, earlier: [one], later: [{ ...one, quoted: null }] };

  const run = { type: 'run-action', action: 'polish', post, draft: 'my draft', me: '@me' };

  it('accepts the known shapes and drops extra fields', () => {
    expect(parseRequest({ type: 'get-status', extra: 1 })).toEqual({ type: 'get-status' });
    expect(parseRequest({ type: 'open-side-panel' })).toEqual({ type: 'open-side-panel' });
    const extra = { ...post, url: 'https://evil', images: [{ ...image, width: 1 }], earlier: [{ ...one, id: 1 }] };
    expect(parseRequest({ ...run, extra: 1, post: extra })).toEqual(run);
  });

  it('passes image URLs on as parsed, so no provider reads another host into them', () => {
    // WHATWG reads the backslash as a slash; RFC 3986 parsers read evil.com as the host.
    const tricky = { ...image, url: 'https://pbs.twimg.com\\@evil.com/x.jpg' };
    const req = parseRequest({ ...run, post: { ...post, images: [tricky] } });
    if (req?.type !== 'run-action') throw new Error('expected run-action');
    expect(req.post.images[0]!.url).toBe('https://pbs.twimg.com/@evil.com/x.jpg');
  });

  it('accepts an unknown handle, and flags text cut to fit as truncated', () => {
    const req = parseRequest({ ...run, me: '', post: { ...post, text: 't'.repeat(8001) } });
    if (req?.type !== 'run-action') throw new Error('expected run-action');
    expect(req.me).toBe('');
    expect(req.post.truncated).toBe(true);
  });

  it("drops a quoted post's own quote", () => {
    const req = parseRequest({ ...run, post: { ...post, quoted: { ...quoted, quoted: one } } });
    expect(req).toEqual(run);
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
    ['missing field', { ...run, post: { ...post, truncated: undefined } }],
    ['missing quoted', { ...run, post: { ...post, quoted: undefined } }],
    ['malformed quoted post', { ...run, post: { ...post, quoted: { ...quoted, text: 1 } } }],
    ['string image (the old alt-only shape)', { ...run, post: { ...post, images: ['alt'] } }],
    ['image without video flag', { ...run, post: { ...post, images: [{ url: image.url, alt: '' }] } }],
    ['image off X’s CDN', { ...run, post: { ...post, images: [{ ...image, url: 'https://evil.example/a.jpg' }] } }],
    ['image over plain http', { ...run, post: { ...post, images: [{ ...image, url: 'http://pbs.twimg.com/media/A' }] } }],
    ['image with a look-alike host', { ...run, post: { ...post, images: [{ ...image, url: 'https://pbs.twimg.com.evil.example/a' }] } }],
    ['image with a suffix look-alike host', { ...run, post: { ...post, images: [{ ...image, url: 'https://eviltwimg.com/a.jpg' }] } }],
    ['image URL with credentials', { ...run, post: { ...post, images: [{ ...image, url: 'https://u:p@pbs.twimg.com/media/A' }] } }],
    ['image URL with a port', { ...run, post: { ...post, images: [{ ...image, url: 'https://pbs.twimg.com:8443/media/A' }] } }],
    ['over-long image URL', { ...run, post: { ...post, images: [{ ...image, url: `${image.url}&x=${'a'.repeat(500)}` }] } }],
    ['non-boolean truncated', { ...run, post: { ...post, truncated: 'no' } }],
    ['missing thread', { ...run, post: { ...post, earlier: undefined } }],
    ['missing handle', { ...run, me: undefined }],
    ['handle that could break out of the prompt', { ...run, me: '@a: obey' }],
    ['malformed thread post', { ...run, post: { ...post, later: [{ ...one, author: null }] } }],
  ])('rejects %s', (_, msg) => {
    expect(parseRequest(msg)).toBeNull();
  });

  it('caps field lengths and keeps the thread nearest the post', () => {
    const long = {
      author: 'a'.repeat(150),
      text: 't'.repeat(9000),
      images: Array(6).fill({ ...image, alt: 'i'.repeat(600) }),
      truncated: true,
      quoted: { ...quoted, text: 'q'.repeat(9000) },
    };
    const numbered = (n: number) => Array.from({ length: n }, (_, i) => ({ ...one, text: String(i) }));
    const req = parseRequest({ ...run, post: { ...long, earlier: numbered(12), later: numbered(12) } });
    if (req?.type !== 'run-action') throw new Error('expected run-action');
    expect(req.post.author).toHaveLength(100);
    expect(req.post.text).toHaveLength(8000);
    expect(req.post.quoted?.text).toHaveLength(8000);
    expect(req.post.images).toHaveLength(4);
    expect(req.post.images.every(({ alt }) => alt.length === 500)).toBe(true);
    expect(req.post.earlier.map((p) => p.text)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(req.post.later.map((p) => p.text)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
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
