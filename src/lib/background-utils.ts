import { ACTIONS, type ActionId, type BackgroundRequest, MAX_TEXT, type TargetPost } from './messages';

const MAX_AUTHOR = 100;
const MAX_IMAGES = 4;
const MAX_ALT = 500;

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
  const { type, action, post, draft } = msg as Record<string, unknown>;
  if (type === 'get-status' || type === 'open-side-panel') return { type };
  // A cut draft would come back rewritten without its tail, so an over-long one is refused, not capped.
  if (type !== 'run-action' || !isAction(action) || !isString(draft) || draft.length > MAX_TEXT) {
    return null;
  }
  const parsed = parsePost(post);
  return parsed && { type, action, post: parsed, draft };
}
