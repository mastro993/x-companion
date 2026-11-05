import { describe, expect, it } from 'vitest';
import { type Generation, regeneration } from '../regenerate';

const page = '/jack/status/20';
const post = { author: '@jack', text: 'just setting up my twttr' };
const target = { page, post };
const fresh = { action: 'reply', draft: '' };
const polished: Generation = { action: 'polish', page, post, draft: 'my draft', result: 'My draft.' };

describe('regeneration', () => {
  it('without a generation for this post, writes a fresh reply', () => {
    expect(regeneration(undefined, target, 'my own text')).toEqual(fresh);
    expect(regeneration(polished, { page, post: { ...post, text: 'another post' } }, 'My draft.')).toEqual(fresh);
    expect(regeneration(polished, { page, post: { ...post, author: '@ev' } }, 'My draft.')).toEqual(fresh);
    // A post page's root outlives its post, and two photo-only posts by one author read alike.
    expect(regeneration(polished, { page: '/jack/status/21', post }, 'My draft, edited.')).toEqual(fresh);
  });

  it('after a fresh reply, writes another one', () => {
    const generated: Generation = { action: 'reply', page, post, draft: '', result: 'nice' };
    expect(regeneration(generated, target, 'nice')).toEqual(fresh);
    expect(regeneration(generated, target, 'nice, edited')).toEqual(fresh);
  });

  it('reruns a rewrite on the text it rewrote, not on its own result', () => {
    expect(regeneration(polished, target, 'My draft.')).toEqual({ action: 'polish', draft: 'my draft' });
  });

  it('reruns a rewrite on the box once the user has edited its result', () => {
    expect(regeneration(polished, target, 'My draft, edited.')).toEqual({ action: 'polish', draft: 'My draft, edited.' });
  });
});
