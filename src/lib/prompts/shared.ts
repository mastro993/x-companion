import type { TargetPost } from '../messages';
import { type Project, STYLE_FIELDS, type StyleField, type StyleGuide } from '../settings';
import type { PromptConfig } from './types';

export const MAX_REPLY_CHARS = 280;

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
  `<\\s*/?\\s*(?:post|context|draft|projects|${STYLE_FIELDS.join('|')})\\b[^<>]*>`,
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
export function profile({ style, projects }: Omit<PromptConfig, 'context'>): string {
  return styleGuide(style) + projectList(projects);
}

/** The post being replied to, after what the page showed around it. */
export function postBlock(post: TargetPost): string {
  const context: string[] = [];
  if (post.quoted) context.push(`The post quotes this post:\n${untrusted(post.quoted)}`);
  if (post.images.length > 0) {
    const alts = post.images.map((alt) => `"${untrusted(alt)}"`).join(', ');
    context.push(`The post has ${post.images.length} image(s), with alt text: ${alts}`);
  }
  if (post.truncated) {
    context.push('The post is longer than shown; only its visible part is below.');
  }

  // Handles are [A-Za-z0-9_]; anything else would break out of the attribute.
  const author = post.author.replace(/[^\w@]/g, '');
  return [
    context.length > 0 ? `<context>\n${context.join('\n')}\n</context>\n` : '',
    `<post${author ? ` author="${author}"` : ''}>\n${untrusted(post.text)}\n</post>`,
  ].join('');
}

// '"Fake news" is old' and '"a" or "b"' keep their quotes.
// Single quotes are left alone: they double as apostrophes.
const WRAPPED = /^["“]([^"“”]*)["”]$/;

/** Trims and strips ONE wrapping quote pair the model added: never one the draft already had. */
export function cleanReply(text: string, draft = ''): string {
  const t = text.trim();
  return WRAPPED.test(draft.trim()) ? t : t.replace(WRAPPED, '$1').trim();
}
