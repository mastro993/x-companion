// Every X-coupled selector and DOM trick lives here, so X markup changes are fixed in one file.
import { ACTIONS, type ActionId, type TargetPost } from './messages';

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
export interface ControlsState {
  ready: boolean; // setup done
  busy: ActionId | null; // running in this composer
  hasText: boolean; // the reply box has text: offer rewrites instead of a fresh reply
}

const LABELS: Record<ActionId, { label: string; busy: string }> = {
  reply: { label: 'Generate', busy: 'Generating…' },
  polish: { label: 'Polish', busy: 'Polishing…' },
  punchier: { label: 'Punchier', busy: 'Rewriting…' },
  'match-style': { label: 'Match style', busy: 'Rewriting…' },
};

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

function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
const SPARKLE = 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z';
const CHEVRON = 'M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z';

/**
 * Inserts our controls before X's Reply button: a Generate pill, and a Rewrite pill whose menu
 * holds the other actions. `onClick` gets the clicked control and its action; null means the
 * Rewrite pill was clicked while its menu is off (setup unfinished or busy).
 * Idempotent: returns null if already there.
 */
export function injectControls(
  c: ReplyComposer,
  onClick: (el: HTMLElement, action: ActionId | null) => void,
): HTMLElement | null {
  const host = c.submit.parentElement!;
  if (host.querySelector(`[${MARK}]`) || host.closest(INSIDE_EDITOR)) return null;

  const wrap = document.createElement('span');
  wrap.className = 'xc-reply';
  wrap.setAttribute(MARK, '');
  // ponytail: copied once, so a live theme switch leaves them stale until X re-mounts the composer
  wrap.style.color = getComputedStyle(c.editor).color; // X's theme text colour, no theme sniffing
  const page = getComputedStyle(document.body).backgroundColor; // X paints its theme on body

  const button = (className: string, action: ActionId | null, ...content: Node[]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.append(...content);
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the editor
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // An armed Rewrite pill opens its menu natively (popovertarget).
      if (btn.popoverTargetElement) return;
      e.preventDefault();
      // Page scripts and other extensions could otherwise spend the user's key; keyboard and AT clicks are trusted.
      if (e.isTrusted) onClick(btn, action);
    });
    return btn;
  };

  const menu = document.createElement('div');
  menu.className = 'xc-menu';
  menu.popover = 'auto';
  if (page !== 'rgba(0, 0, 0, 0)') menu.style.backgroundColor = page;
  for (const action of ACTIONS.filter((a) => a !== 'reply')) {
    const item = button('xc-menu-item', action, document.createTextNode(LABELS[action].label));
    item.addEventListener('click', () => menu.hidePopover());
    menu.append(item);
  }
  const generate = button('xc-reply-btn', 'reply', icon(SPARKLE), document.createElement('span'));
  const rewrite = button('xc-reply-btn', null, icon(SPARKLE), document.createElement('span'), icon(CHEVRON));
  wrap.append(generate, rewrite, menu);

  // ponytail: forces a row on react-native-web column hosts (compact detail composer); revisit if X's layout shifts
  if (getComputedStyle(host).flexDirection.startsWith('column')) {
    host.style.flexDirection = 'row';
    host.style.alignItems = 'center';
  }
  host.insertBefore(wrap, c.submit);
  return wrap;
}

/**
 * Shows Generate on an empty box and Rewrite on a filled one. Rewrites the label only when it
 * changed: a text write is a childList mutation, which would queue another scan.
 */
export function renderControls(wrap: Element, { ready, busy, hasText }: ControlsState): void {
  const [generate, rewrite] = wrap.querySelectorAll<HTMLButtonElement>(':scope > .xc-reply-btn');
  const menu = wrap.querySelector<HTMLElement>('.xc-menu');
  if (!generate || !rewrite || !menu) return;
  const rewriting = busy ? busy !== 'reply' : hasText;
  const btn = rewriting ? rewrite : generate;
  generate.hidden = rewriting;
  rewrite.hidden = !rewriting;

  const label = busy ? LABELS[busy].busy : rewriting ? 'Rewrite' : LABELS.reply.label;
  const span = btn.querySelector('span')!;
  if (span.textContent !== label) span.textContent = label; // a text write is a childList mutation
  const attr = (name: string, value: string | false) =>
    value === false ? btn.removeAttribute(name) : btn.setAttribute(name, value);
  const verb = busy ? (rewriting ? 'Rewriting draft' : 'Generating reply') : rewriting ? 'Rewrite draft' : 'Generate reply';
  attr('aria-label', `${verb} with x-companion`);
  attr('aria-busy', !!busy && 'true');
  // aria-disabled rather than `disabled`: a setup click must still fire to open the side panel.
  attr('aria-disabled', !ready && 'true');
  attr('title', !ready && 'x-companion: finish setup in the side panel');

  // The invoker is also the menu's implicit anchor and is exempt from its light dismiss.
  const armed = ready && !busy && rewriting;
  if (!armed) menu.hidePopover(); // a no-op when closed
  rewrite.popoverTargetElement = armed ? menu : null;
}

/** Closes an open Rewrite menu; false if none was open. */
export function closeMenu(): boolean {
  const open = document.querySelector<HTMLElement>('.xc-menu:popover-open');
  open?.hidePopover();
  return !!open;
}

export function injectedControls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${MARK}]`)];
}

/** Our controls wrapper around `el` (a pill or a menu item). */
export const controlsOf = (el: Element) => el.closest<HTMLElement>(`[${MARK}]`);

export function removeInjected(): void {
  for (const n of document.querySelectorAll(`[${MARK}]`)) n.remove();
}

/** Short message bubble over the controls; replaces any previous one, clears itself after ~6 s. */
export function showAlert(wrap: HTMLElement, message: string): void {
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
export function readEditor(ed: HTMLElement): string {
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
