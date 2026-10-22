import type { Post, PostImage, TargetPost } from '../messages';
import { type Project, STYLE_FIELDS, type StyleField, type StyleGuide } from '../settings';
import type { Profile, PromptImage } from './types';

/** X's limit without Premium, for posts and replies alike. */
export const MAX_CHARS = 280;
/** Most pictures sent with one request. The rest keep their marker and alt text. */
const MAX_PROMPT_IMAGES = 8;

// Each section's tag is its field name.
const STYLE_INTROS: Record<StyleField, string> = {
  persona: 'Who the user is and what they care about',
  audience: 'Who they speak to and what resonates with them',
  voice: 'Their tone, structure, vocabulary and signature phrases. Mimic them',
  rules: "Their dos and don'ts. Always respect them",
};

// Page text is material: drop our delimiter tags so it can't close <post> early or pose as a
// profile section. Repeat until stable, or '</pos</post>t>' would rebuild a tag. [^<>] keeps
// each pass linear on unclosed '<post' runs.
const DELIMITER = new RegExp(
  `<\\s*/?\\s*(?:post|earlier|later|quote|draft|projects|${STYLE_FIELDS.join('|')})\\b[^<>]*>`,
  'gi',
);

function untrusted(s: string): string {
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(DELIMITER, '');
  }
  return s.trim();
}

function styleGuide(style: StyleGuide): string {
  const sections = STYLE_FIELDS.filter((f) => style[f].trim()).map(
    (f) => `${STYLE_INTROS[f]}:\n<${f}>\n${style[f].trim()}\n</${f}>`,
  );
  return sections.length > 0 ? `\n\nThe user's style guide:\n\n${sections.join('\n\n')}` : '';
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Named projects only, one line each. */
function projectList(projects: Project[]): string {
  const lines = projects
    .filter((p) => p.name.trim())
    .map((p) => {
      const description = oneLine(p.description);
      const link = oneLine(p.link);
      return `- ${oneLine(p.name)}${description && `: ${description}`}${link && ` (${link})`}`;
    });
  return lines.length > 0
    ? `\n\nThe user's projects, and the only facts about them you may use:\n<projects>\n${lines.join('\n')}\n</projects>`
    : '';
}

/** System prompt tail: the filled style guide sections and named projects; '' when there are none. */
export function profile({ style, projects }: Profile): string {
  return styleGuide(style) + projectList(projects);
}

/** Rules that explain postBlock's layout, for every system prompt. */
export const materialRules = (me: string) => `- <earlier> posts come before <post> in the conversation, oldest first. <later> posts are its author's own follow-ups below it. A <quote> is the post that the post around it quotes. truncated="true" marks a post shown only up to "Show more".
- [Image N] and [Video N] mark a post's media, then its alt text if any. A picture labelled "Image N:" or "Video N:" that comes with the message is that media (a video's is its thumbnail). For media without one, go by the alt text only and never guess what it shows.${
  // Handles are [A-Za-z0-9_], and the background checks this one.
  me && `\n- The user is ${me}: posts by ${me} are the user's own.`
}`;

type Label = (image: PostImage) => string;

function block(tag: string, post: Post, label: Label): string {
  const lines = [untrusted(post.text)];
  for (const image of post.images) {
    const alt = oneLine(untrusted(image.alt));
    lines.push(`[${label(image)}${alt && `: ${alt}`}]`);
  }
  if (post.quoted) lines.push(block('quote', post.quoted, label));
  // Handles are [A-Za-z0-9_]; anything else would break out of the attribute.
  const author = post.author.replace(/[^\w@]/g, '');
  const attrs = `${author && ` author="${author}"`}${post.truncated ? ' truncated="true"' : ''}`;
  return `<${tag}${attrs}>\n${lines.filter(Boolean).join('\n')}\n</${tag}>`;
}

/** The post being replied to, inside the conversation the page showed, and the pictures to attach. */
export function postBlock(post: TargetPost): { text: string; images: PromptImage[] } {
  // Pictures by priority: the post's, its quote's, then the thread's, nearest first.
  const sent = [post, ...post.earlier.toReversed(), ...post.later]
    .flatMap((p) => [...p.images, ...(p.quoted?.images ?? [])])
    .slice(0, MAX_PROMPT_IMAGES);
  // Sent pictures are numbered; the rest keep a bare marker.
  const label: Label = (image) => {
    const i = sent.indexOf(image);
    return `${image.video ? 'Video' : 'Image'}${i < 0 ? '' : ` ${i + 1}`}`;
  };
  const text = [
    ...post.earlier.map((p) => block('earlier', p, label)),
    block('post', post, label),
    ...post.later.map((p) => block('later', p, label)),
  ].join('\n');
  return { text, images: sent.map((image) => ({ label: label(image), url: image.url })) };
}

// '"Fake news" is old' and '"a" or "b"' keep their quotes.
// Single quotes are left alone: they double as apostrophes.
const WRAPPED = /^["“]([^"“”]*)["”]$/;

/** Trims and strips ONE wrapping quote pair the model added: never one the draft already had. */
export function cleanReply(text: string, draft = ''): string {
  const t = text.trim();
  return WRAPPED.test(draft.trim()) ? t : t.replace(WRAPPED, '$1').trim();
}
