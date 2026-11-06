import type { ActionId, Post } from './messages';

type PostKey = Pick<Post, 'author' | 'text'>;

/** Where a reply composer generated: the page, and the post it answered. */
export interface Target {
  page: string; // location.pathname: tells apart look-alike posts, such as two photo-only ones
  post: PostKey;
}

/** A reply composer's last successful generation, which Regenerate retries. */
export interface Generation extends Target {
  action: ActionId;
  draft: string; // the text it worked on: '' for a fresh reply
  result: string; // the reply box's text once it was done
}

export const samePost = (a: PostKey, b: PostKey) => a.author === b.author && a.text === b.text;

/**
 * What Regenerate runs on a box holding `box`: the last generation for this target again, on the
 * text it worked on while its result is still in the box, else on the user's edit. Without one,
 * a fresh reply.
 */
export function regeneration(
  last: Generation | undefined,
  { page, post }: Target,
  box: string,
): { action: ActionId; draft: string } {
  if (!last || last.page !== page || !samePost(last.post, post) || last.action === 'reply') {
    return { action: 'reply', draft: '' };
  }
  return { action: last.action, draft: box === last.result ? last.draft : box };
}
