import {
  ACTIONS,
  type ActionId,
  type BackgroundRequest,
  MAX_TEXT,
  type Post,
  type PostImage,
  type TargetPost,
} from './messages';

const MAX_AUTHOR = 100;
const MAX_IMAGES = 4; // X's limit per post
const MAX_ALT = 500;
const MAX_URL = 500;
/** Most posts kept on each side of the target post: the nearest ones. */
const MAX_THREAD = 10;

const MAX_ERROR = 200;
// Key shapes (sk-, sk-ant-, sk-or-, xai-), OpenAI org- and proj_ IDs, and UUIDs such as xAI team IDs.
const SECRET_LIKE = /\b(?:sk|xai|org|proj)[-_][\w*.-]+|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;

/** Provider error text bound for x.com: without the key or anything key- or ID-shaped, and short. */
export function safeError(message: string, apiKey: string): string {
  const clean = (apiKey ? message.replaceAll(apiKey, '…') : message).replace(SECRET_LIKE, '…');
  return clean.length > MAX_ERROR ? `${clean.slice(0, MAX_ERROR - 1)}…` : clean;
}

/** Missing url (scrubbed: no host permission for the tab) counts as not x.com. */
export function isXUrl(url: string | undefined): boolean {
  return !!url && URL.parse(url)?.hostname === 'x.com';
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isAction = (v: unknown): v is ActionId => ACTIONS.includes(v as ActionId);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Only X's media server: providers fetch these URLs, so a page must not pick what they fetch. The
 * parsed form goes on, so a provider can't read the host differently (`https://pbs.twimg.com\@evil`).
 */
function mediaUrl(raw: string): string | null {
  const u = URL.parse(raw);
  const ok = u?.protocol === 'https:' && u.hostname === 'pbs.twimg.com' && !u.port && !u.username && !u.password;
  return ok && u.href.length <= MAX_URL ? u.href : null;
}

function parseImage(v: unknown): PostImage | null {
  if (!isObject(v)) return null;
  const { alt, video } = v;
  const url = isString(v.url) ? mediaUrl(v.url) : null;
  if (!url || !isString(alt) || typeof video !== 'boolean') return null;
  return { url, alt: alt.slice(0, MAX_ALT), video };
}

/** Every item parsed, or null if any fails. `keep` caps the list before any parsing. */
function parseAll<T>(
  items: unknown,
  keep: (items: unknown[]) => unknown[],
  parse: (v: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(items)) return null;
  const parsed = keep(items).map((v) => parse(v));
  return parsed.includes(null) ? null : (parsed as T[]);
}

/** A quoted post's own quote is dropped: X shows only one level. */
function parsePost(v: unknown, canQuote = true): Post | null {
  if (!isObject(v)) return null;
  const { author, text, truncated, quoted } = v;
  const images = parseAll(v.images, (i) => i.slice(0, MAX_IMAGES), parseImage);
  if (!isString(author) || !isString(text) || typeof truncated !== 'boolean' || !images) return null;
  if (quoted !== null && !isObject(quoted)) return null;
  const quote = quoted && canQuote ? parsePost(quoted, false) : null;
  if (quoted && canQuote && !quote) return null;
  return {
    author: author.slice(0, MAX_AUTHOR),
    text: text.slice(0, MAX_TEXT),
    images,
    truncated: truncated || text.length > MAX_TEXT,
    quoted: quote,
  };
}

function parseTarget(v: unknown): TargetPost | null {
  const post = parsePost(v);
  if (!post || !isObject(v)) return null;
  // The nearest posts matter most: the end of what came before, the start of what follows.
  const earlier = parseAll(v.earlier, (p) => p.slice(-MAX_THREAD), parsePost);
  const later = parseAll(v.later, (p) => p.slice(0, MAX_THREAD), parsePost);
  return earlier && later && { ...post, earlier, later };
}

/** Content-script messages are untrusted: rebuild a known shape with capped lengths, or null. */
export function parseRequest(msg: unknown): BackgroundRequest | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const { type, action, post, draft, me } = msg as Record<string, unknown>;
  if (type === 'get-status' || type === 'open-side-panel') return { type };
  // A cut draft would come back rewritten without its tail, so an over-long one is refused, not capped.
  if (!isString(draft) || draft.length > MAX_TEXT) return null;
  // A post is only ever refined, never written from nothing.
  if (type === 'refine-post') return draft.trim() ? { type, draft } : null;
  if (type !== 'run-action' || !isAction(action)) return null;
  if (!isString(me) || !/^(?:@\w{1,15})?$/.test(me)) return null;
  const parsed = parseTarget(post);
  return parsed && { type, action, post: parsed, draft, me };
}
