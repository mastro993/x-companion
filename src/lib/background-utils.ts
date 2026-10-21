import type { BackgroundRequest, TargetPost } from './messages';

const MAX_TEXT = 8000;
const MAX_AUTHOR = 100;
const MAX_IMAGES = 4;
const MAX_ALT = 500;

/** Missing url (scrubbed: no host permission for the tab) counts as not x.com. */
export function isXUrl(url: string | undefined): boolean {
  return !!url && URL.parse(url)?.hostname === 'x.com';
}

const isString = (v: unknown): v is string => typeof v === 'string';

function parsePost(v: unknown): TargetPost | null {
  if (typeof v !== 'object' || v === null) return null;
  const { author, text, quoted, images, truncated } = v as Record<string, unknown>;
  if (
    !isString(author) ||
    !isString(text) ||
    !isString(quoted) ||
    typeof truncated !== 'boolean' ||
    !Array.isArray(images) ||
    !images.every(isString)
  ) {
    return null;
  }
  return {
    author: author.slice(0, MAX_AUTHOR),
    text: text.slice(0, MAX_TEXT),
    quoted: quoted.slice(0, MAX_TEXT),
    images: images.slice(0, MAX_IMAGES).map((alt) => alt.slice(0, MAX_ALT)),
    truncated,
  };
}

/** Content-script messages are untrusted: rebuild a known shape with capped lengths, or null. */
export function parseRequest(msg: unknown): BackgroundRequest | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const { type, post } = msg as Record<string, unknown>;
  if (type === 'get-status' || type === 'open-side-panel') return { type };
  if (type !== 'generate-reply') return null;
  const parsed = parsePost(post);
  return parsed && { type, post: parsed };
}
