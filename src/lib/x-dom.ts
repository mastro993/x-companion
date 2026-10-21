// Every X-coupled selector and DOM trick lives here, so X markup changes are fixed in one file.
import type { TargetPost } from './messages';

// Draft.js contenteditable (thread parts are _1.._n), plus the narrow-layout textarea.
const EDITOR =
  '[data-testid^="tweetTextarea_"][contenteditable="true"], main div[data-testid^="tweetTextarea"] textarea';
// X flips between these two within one route; always query both.
const SUBMIT = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
const TWEET = 'article[data-testid="tweet"]';
const QUOTE = 'div[role="link"], [data-testid="quoteTweet"], [data-testid="card.wrapper"]';
const INSIDE_EDITOR = '[contenteditable], .DraftEditor-root, [data-testid$="RichTextInputContainer"]';
const MARK = 'data-xc-reply';
const COMPOSE_PATH = '/compose/post';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface Composer {
  root: Element;
  editor: HTMLElement;
}
interface ReplyComposer extends Composer {
  submit: HTMLElement;
}
type ButtonState = 'ready' | 'setup' | 'busy';

// Anchored: /photo/1, /video/1, /analytics are modals over the page below (e.g. the home composer).
const statusId = () => location.pathname.match(/^\/(?:i\/web|[^/]+)\/status\/(\d+)\/?$/)?.[1];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Composer root: a dialog, or `main` on a status page / the narrow-layout compose page. */
export function rootOf(el: Element): Element | null {
  return (
    el.closest('[role="dialog"]') ??
    (statusId() || location.pathname === COMPOSE_PATH ? el.closest('main') : null)
  );
}

/** Dialogs and the compose page need an original post above the editor; status pages have the focal post. */
const needsArticle = (root: Element) =>
  root.matches('[role="dialog"]') || location.pathname === COMPOSE_PATH;

/** Post being replied to; null = not a reply composer (new post, quote, home). */
function targetArticle({ root, editor }: Composer): HTMLElement | null {
  const articles = [...root.querySelectorAll<HTMLElement>(TWEET)];
  if (needsArticle(root)) {
    // The original sits above the editor; a quote preview mounts in `attachments` below it.
    return (
      articles.findLast(
        (a) =>
          !a.closest('[data-testid="attachments"]') &&
          a.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING,
      ) ?? null
    );
  }
  const id = statusId();
  if (!id) return null;
  // Root-scoped: #layers precedes the app in the DOM and dialog articles also carry tabindex="-1".
  return (
    articles.find((a) => a.querySelector(`a[href$="/status/${id}"] time`)) ??
    root.querySelector<HTMLElement>(`${TWEET}[tabindex="-1"]`)
  );
}

function nearest(from: Element, sel: string, stop: Element): HTMLElement | null {
  for (let n = from.parentElement; n; n = n === stop ? null : n.parentElement) {
    const hit = n.querySelector<HTMLElement>(sel);
    if (hit) return hit;
  }
  return null;
}

export function findReplyComposers(): ReplyComposer[] {
  const seen = new Set<Element>();
  const out: ReplyComposer[] = [];
  for (const editor of document.querySelectorAll<HTMLElement>(EDITOR)) {
    const root = rootOf(editor);
    if (!root || seen.has(root)) continue; // home composer; thread parts after the first
    seen.add(root);
    if (needsArticle(root) && !targetArticle({ root, editor })) continue; // new-post / quote
    const submit = nearest(editor, SUBMIT, root);
    if (submit?.parentElement) out.push({ root, editor, submit });
  }
  return out;
}

/** Click-time resolution: X re-mounts roots and editors, so never trust what was seen at injection. */
export function composerOf(btn: Element): Composer | null {
  const root = rootOf(btn);
  const editor = root?.querySelector<HTMLElement>(EDITOR);
  return root && editor ? { root, editor } : null;
}

function sparkleIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z');
  svg.append(path);
  return svg;
}

/** Inserts our button before X's Reply button. Idempotent: returns null if already there. */
export function injectButton(
  c: ReplyComposer,
  onClick: (btn: HTMLButtonElement) => void,
): HTMLButtonElement | null {
  const host = c.submit.parentElement!;
  if (host.querySelector(`[${MARK}]`) || host.closest(INSIDE_EDITOR)) return null;

  const wrap = document.createElement('span');
  wrap.className = 'xc-reply';
  wrap.setAttribute(MARK, '');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'xc-reply-btn';
  // ponytail: copied once, so a live theme switch leaves it stale until X re-mounts the composer
  btn.style.color = getComputedStyle(c.editor).color; // X's theme text colour, no theme sniffing
  btn.append(sparkleIcon(), document.createElement('span'));
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the editor
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Page scripts and other extensions could otherwise spend the user's key; keyboard and AT clicks are trusted.
    if (e.isTrusted) onClick(btn);
  });
  wrap.append(btn);

  // ponytail: forces a row on react-native-web column hosts (compact detail composer); revisit if X's layout shifts
  if (getComputedStyle(host).flexDirection.startsWith('column')) {
    host.style.flexDirection = 'row';
    host.style.alignItems = 'center';
  }
  host.insertBefore(wrap, c.submit);
  return btn;
}

export function updateButton(btn: HTMLButtonElement, state: ButtonState): void {
  const attr = (name: string, value: string | false) =>
    value === false ? btn.removeAttribute(name) : btn.setAttribute(name, value);
  const busy = state === 'busy';
  btn.lastElementChild!.textContent = busy ? 'Generating…' : 'Generate';
  attr('aria-label', busy ? 'Generating reply with x-companion' : 'Generate reply with x-companion');
  attr('aria-busy', busy && 'true');
  // aria-disabled rather than `disabled`: a setup click must still fire to open the side panel.
  attr('aria-disabled', state === 'setup' && 'true');
  attr('title', state === 'setup' && 'x-companion: finish setup in the side panel');
}

export function injectedButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(`[${MARK}] > .xc-reply-btn`)];
}

export function removeInjected(): void {
  for (const n of document.querySelectorAll(`[${MARK}]`)) n.remove();
}

/** Short message bubble next to the button; replaces any previous one, clears itself after ~6 s. */
export function showAlert(btn: HTMLButtonElement, message: string): void {
  const wrap = btn.parentElement!;
  wrap.querySelector('.xc-reply-alert')?.remove();
  const alert = document.createElement('span');
  alert.className = 'xc-reply-alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  wrap.append(alert);
  if (wrap.getBoundingClientRect().top < alert.offsetHeight + 8) alert.classList.add('xc-reply-alert--below');
  setTimeout(() => alert.remove(), 6000);
}

/** textContent drops emoji: X renders them as <img alt="😀">. */
function textOf(el: Element | undefined): string {
  if (!el) return '';
  let s = '';
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue ?? '';
    else if (n instanceof HTMLImageElement) s += n.alt;
  }
  return s.trim();
}

export function getTargetPost(c: Composer): TargetPost | null {
  const a = targetArticle(c);
  if (!a) return null;
  // Every <a> on X has role="link" (incl. the post's own photo links), so only div[role=link] is a quote card.
  const inQuote = (el: Element) => {
    const q = el.closest(QUOTE);
    return !!q && a.contains(q);
  };
  const own = <T extends Element>(sel: string) =>
    [...a.querySelectorAll<T>(sel)].filter((el) => !inQuote(el));
  const texts = [...a.querySelectorAll('[data-testid="tweetText"]')];
  const head = own('[data-testid="User-Name"]')[0];
  // The reply dialog's copy of the original can render the header as spans, without profile links.
  const handle =
    head?.querySelector('a[href^="/"]')?.getAttribute('href')?.slice(1) ??
    textOf(head).match(/@(\w{1,15})/)?.[1];
  return {
    author: handle ? `@${handle}` : '',
    // The reply modal appends pic.x.com short links for attached media.
    text: textOf(texts.find((t) => !inQuote(t)))
      .replace(/\s*pic\.(x|twitter)\.com\/\S+/g, '')
      .trim(),
    quoted: textOf(texts.find(inQuote)),
    images: own<HTMLImageElement>('[data-testid="tweetPhoto"] img').map((i) => i.alt),
    truncated: own('[data-testid="tweet-text-show-more-link"]').length > 0,
  };
}

/** Draft model text: one line per block (innerText doubles blank lines). */
function readEditor(ed: HTMLElement): string {
  if (ed instanceof HTMLTextAreaElement) return ed.value;
  const blocks = ed.querySelectorAll('[data-block="true"]');
  return blocks.length ? [...blocks].map((b) => b.textContent ?? '').join('\n') : ed.innerText;
}

/** Newline-aware: collapses spaces within lines only, so a paste that lost line breaks fails. */
const norm = (s: string) =>
  s
    .split(/\r\n?|\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();

function selectAll(ed: HTMLElement) {
  ed.focus();
  if (ed instanceof HTMLTextAreaElement) return ed.select();
  const range = document.createRange();
  range.selectNodeContents(ed);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand('selectAll'); // the Range alone needs a live caret, else inserts append
}

/** Replaces the composer text. Never submits. Returns false if the text could not be verified. */
export async function setComposerText(ed: HTMLElement, text: string): Promise<boolean> {
  const before = readEditor(ed);
  const done = () => norm(readEditor(ed)) === norm(text);
  const settle = async () => {
    for (let t = 0; t < 1500 && !done(); t += 50) await sleep(50);
    return done();
  };

  selectAll(ed);
  await sleep(120); // Draft syncs its selection on selectionchange, a later task
  const dt = new DataTransfer();
  dt.setData('text/plain', text); // not text/html: Draft prefers it and collapses newlines
  const paste = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  ed.dispatchEvent(paste);
  // Draft calls preventDefault() before anything else, so its handler ran: never stack a second write.
  if (paste.defaultPrevented || readEditor(ed) !== before) return settle();

  // Nobody handled the paste (narrow-layout textarea, non-Draft editor): insertText is reliable there.
  // insertText targets the focus, not `ed`: a detached or blurred editor would write elsewhere.
  if (document.activeElement !== ed) return false;
  document.execCommand('insertText', false, text);
  return settle();
}
