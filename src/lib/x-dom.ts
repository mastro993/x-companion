// Every X-coupled selector and DOM trick lives here, so X markup changes are fixed in one file.
import { ACTIONS, type ActionId, type Post, type PostImage, type TargetPost } from './messages';

// Draft.js contenteditable (thread parts are _1.._n), plus the narrow-layout textarea.
const EDITOR =
  '[data-testid^="tweetTextarea_"][contenteditable="true"], main div[data-testid^="tweetTextarea"] textarea';
// X flips between these two within one route; always query both.
const SUBMIT = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
const TWEET = 'article[data-testid="tweet"]';
// Quote cards, and link preview cards, which hold none of the post's own content either.
const QUOTE = 'div[role="link"], [data-testid="card.wrapper"]';
const REPLY_BUTTON = '[data-testid="reply"]';
const EDITABLE = 'input, textarea, [contenteditable]';
const CELL = '[data-testid="cellInnerDiv"]';
const INSIDE_EDITOR = '[contenteditable], .DraftEditor-root, [data-testid$="RichTextInputContainer"]';
const MARK = 'data-xc-reply';
const COMPOSE_PATH = '/compose/post';
const HOME_PATH = '/home';
const QUOTE_PREVIEW = `[data-testid="attachments"] ${TWEET}`;
const SVG_NS = 'http://www.w3.org/2000/svg';

interface Composer {
  root: Element;
  editor: HTMLElement;
}
/** `reply` answers a post; `post` is a new post, which is only ever refined from the user's draft. */
export type ComposerKind = 'reply' | 'post';
interface FoundComposer extends Composer {
  submit: HTMLElement;
  kind: ComposerKind;
}
/**
 * What a control runs: an action, `refine`, which empties the box and then runs `reply`, or
 * `refine-post`, which rewrites a new post's draft.
 */
export type ControlAction = ActionId | 'refine' | 'refine-post';
/** What runs while a control is busy: `refine` runs as `reply`. */
export type RunningAction = Exclude<ControlAction, 'refine'>;
export interface ControlsState {
  ready: boolean; // setup done
  busy: RunningAction | null; // running in this composer
  hasText: boolean; // the box has text: offer Refine and Rewrite instead of Generate, or enable post Refine
}

const LABELS: Record<RunningAction, { label: string; busy: string }> = {
  reply: { label: 'Generate', busy: 'Generating…' },
  'refine-post': { label: 'Refine', busy: 'Refining…' },
  polish: { label: 'Polish', busy: 'Polishing…' },
  punchier: { label: 'Punchier', busy: 'Rewriting…' },
  'match-style': { label: 'Match style', busy: 'Rewriting…' },
};

// Anchored: /photo/1, /video/1, /analytics are modals over the page below (e.g. the home composer).
const statusId = () => location.pathname.match(/^\/(?:i\/web|[^/]+)\/status\/(\d+)\/?$/)?.[1];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** Composer root: a dialog, or `main` on a status page, the narrow-layout compose page or home. */
export function rootOf(el: Element): Element | null {
  const { pathname } = location;
  return (
    el.closest('[role="dialog"]') ??
    (statusId() || pathname === COMPOSE_PATH || pathname === HOME_PATH ? el.closest('main') : null)
  );
}

/** Dialogs and the compose page need an original post above the editor; status pages have the focal post. */
const needsArticle = (root: Element) =>
  root.matches('[role="dialog"]') || location.pathname === COMPOSE_PATH;

/** Post being replied to; null = not a reply composer (new post, quote). */
function targetArticle({ root, editor }: Composer): HTMLElement | null {
  const articles = [...root.querySelectorAll<HTMLElement>(TWEET)];
  if (needsArticle(root)) {
    // The original sits above the editor; a quote preview mounts in `attachments` below it.
    return (
      articles.findLast(
        (a) => !a.closest('[data-testid="attachments"]') && follows(a, editor),
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

/** null = a quote composer, or a status page whose focal post isn't there. */
function kindOf(c: Composer): ComposerKind | null {
  if (targetArticle(c)) return 'reply';
  const fresh = needsArticle(c.root) || location.pathname === HOME_PATH;
  return fresh && !c.root.querySelector(QUOTE_PREVIEW) ? 'post' : null;
}

/** Reply and new-post composers. A thread's parts after the first share its root and are skipped. */
export function findComposers(): FoundComposer[] {
  const seen = new Set<Element>();
  const out: FoundComposer[] = [];
  for (const editor of document.querySelectorAll<HTMLElement>(EDITOR)) {
    const root = rootOf(editor);
    if (!root || seen.has(root)) continue;
    seen.add(root);
    const kind = kindOf({ root, editor });
    const submit = nearest(editor, SUBMIT, root);
    if (kind && submit?.parentElement) out.push({ root, editor, submit, kind });
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
const REFRESH =
  'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z';
const SETUP_HINT = 'x-companion: finish setup in the side panel';

/**
 * Inserts our controls before X's Reply or Post button. A reply composer gets a Generate pill, a
 * Refine icon, and a Rewrite pill whose menu holds the other actions; a new post gets one Refine
 * pill. `onClick` gets the clicked control and its action; null means the Rewrite pill was clicked
 * while its menu is off (setup unfinished or busy).
 * Idempotent: returns null if already there. Swaps controls of the wrong kind, e.g. injected
 * before the dialog's original post rendered.
 */
export function injectControls(
  c: FoundComposer,
  onClick: (el: HTMLElement, action: ControlAction | null) => void,
): HTMLElement | null {
  const host = c.submit.parentElement!;
  if (host.closest(INSIDE_EDITOR)) return null;
  const old = host.querySelector(`[${MARK}]`);
  if (old?.getAttribute(MARK) === c.kind) return null;
  old?.remove();

  const wrap = document.createElement('span');
  wrap.className = 'xc-reply';
  wrap.setAttribute(MARK, c.kind);
  // ponytail: copied once, so a live theme switch leaves them stale until X re-mounts the composer
  wrap.style.color = getComputedStyle(c.editor).color; // X's theme text colour, no theme sniffing

  const button = (className: string, action: ControlAction | null, ...content: Node[]) => {
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

  if (c.kind === 'post') {
    wrap.append(button('xc-reply-btn', 'refine-post', icon(SPARKLE), document.createElement('span')));
  } else {
    const menu = document.createElement('div');
    menu.className = 'xc-menu';
    menu.popover = 'auto';
    const page = getComputedStyle(document.body).backgroundColor; // X paints its theme on body
    if (page !== 'rgba(0, 0, 0, 0)') menu.style.backgroundColor = page;
    for (const action of ACTIONS.filter((a) => a !== 'reply')) {
      const item = button('xc-menu-item', action, document.createTextNode(LABELS[action].label));
      item.addEventListener('click', () => menu.hidePopover());
      menu.append(item);
    }
    const generate = button('xc-reply-btn', 'reply', icon(SPARKLE), document.createElement('span'));
    const refine = button('xc-reply-btn xc-reply-btn--icon', 'refine', icon(REFRESH));
    refine.setAttribute('aria-label', 'Refine reply with x-companion'); // the icon has no visible text
    const rewrite = button('xc-reply-btn', null, icon(SPARKLE), document.createElement('span'), icon(CHEVRON));
    wrap.append(generate, refine, rewrite, menu);
  }

  // ponytail: forces a row on react-native-web column hosts (compact detail composer); revisit if X's layout shifts
  if (getComputedStyle(host).flexDirection.startsWith('column')) {
    host.style.flexDirection = 'row';
    host.style.alignItems = 'center';
  }
  host.insertBefore(wrap, c.submit);
  return wrap;
}

const attr = (el: Element, name: string, value: string | false) =>
  value === false ? el.removeAttribute(name) : el.setAttribute(name, value);

/** Only when it changed: a text write is a childList mutation, which would queue another scan. */
function setLabel(btn: Element, label: string) {
  const span = btn.querySelector('span')!;
  if (span.textContent !== label) span.textContent = label;
}

function setState(el: Element, { ready, busy }: ControlsState) {
  attr(el, 'aria-busy', !!busy && 'true');
  // aria-disabled rather than `disabled`: a setup click must still fire to open the side panel.
  attr(el, 'aria-disabled', !ready && 'true');
}

/**
 * Reply composer: Generate on an empty box, and Refine and Rewrite on a filled one. New post:
 * Refine, disabled until the box has a draft to refine.
 */
export function renderControls(wrap: Element, state: ControlsState): void {
  const { ready, busy, hasText } = state;
  if (wrap.getAttribute(MARK) === 'post') {
    const btn = wrap.querySelector<HTMLButtonElement>(':scope > .xc-reply-btn');
    if (!btn) return;
    setLabel(btn, busy ? LABELS['refine-post'].busy : LABELS['refine-post'].label);
    attr(btn, 'aria-label', `${busy ? 'Refining' : 'Refine'} post with x-companion`);
    setState(btn, state);
    btn.disabled = ready && !busy && !hasText; // a setup click must still open the side panel
    attr(btn, 'title', !ready && SETUP_HINT);
    return;
  }

  const [generate, refine, rewrite] = wrap.querySelectorAll<HTMLButtonElement>(':scope > .xc-reply-btn');
  const menu = wrap.querySelector<HTMLElement>('.xc-menu');
  if (!generate || !refine || !rewrite || !menu) return;
  const rewriting = busy ? busy !== 'reply' : hasText;
  const btn = rewriting ? rewrite : generate;
  generate.hidden = rewriting;
  refine.hidden = rewrite.hidden = !rewriting;

  setLabel(btn, busy ? LABELS[busy].busy : rewriting ? 'Rewrite' : LABELS.reply.label);
  const verb = rewriting ? (busy ? 'Rewriting draft' : 'Rewrite draft') : busy ? 'Generating reply' : 'Generate reply';
  attr(btn, 'aria-label', `${verb} with x-companion`);
  for (const el of [btn, refine]) setState(el, state);
  attr(btn, 'title', !ready && SETUP_HINT);
  refine.title = ready ? 'Refine' : SETUP_HINT; // the icon has no visible text

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

/** A pbs.twimg.com picture as JPEG (xAI reads only JPEG and PNG), ~1200 px so screenshot text stays legible. */
function mediaUrl(src: string | null): URL | null {
  const url = URL.parse(src ?? '');
  if (url?.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com') return null;
  if (url.searchParams.has('format')) url.searchParams.set('format', 'jpg');
  if (url.searchParams.has('name')) url.searchParams.set('name', 'medium');
  return url;
}

/** Photos and video thumbnails (amplify_, ext_tw_ and tweet_video_thumb), once each. */
function mediaOf(els: Element[]): PostImage[] {
  const out: PostImage[] = [];
  const seen = new Set<string>();
  for (const el of els) {
    const url = mediaUrl(el.getAttribute(el instanceof HTMLVideoElement ? 'poster' : 'src'));
    if (!url || seen.has(url.pathname)) continue; // a video can show its thumbnail twice
    seen.add(url.pathname);
    const alt = el instanceof HTMLImageElement ? el.alt : '';
    out.push({ url: url.href, alt, video: url.pathname.includes('video_thumb') });
  }
  return out;
}

/** What belongs to `scope` (an article or its quote card) itself, not to a quote card inside it. */
function find(scope: Element, sel: string): Element[] {
  return [...scope.querySelectorAll(sel)].filter((el) => {
    const q = el.closest(QUOTE);
    return !q || q === scope || !scope.contains(q);
  });
}

function authorOf(scope: Element): string {
  const head = find(scope, '[data-testid="User-Name"]')[0];
  // The reply dialog's copy and quote cards render the header as spans, without profile links.
  // The handle comes after the display name, which can hold an @word too.
  const handle =
    head?.querySelector('a[href^="/"]')?.getAttribute('href')?.slice(1) ??
    [...textOf(head).matchAll(/@(\w{1,15})/g)].at(-1)?.[1];
  return handle ? `@${handle}` : '';
}

function postIn(scope: Element): Omit<Post, 'quoted'> {
  return {
    author: authorOf(scope),
    // The reply dialog appends https://pic.x.com short links for attached media.
    text: textOf(find(scope, '[data-testid="tweetText"]')[0])
      .replace(/\s*(?:https?:\/\/)?pic\.(?:x|twitter)\.com\/\S+/g, '')
      .trim(),
    images: mediaOf(find(scope, '[data-testid="tweetPhoto"] img, video[poster]')),
    truncated: find(scope, '[data-testid="tweet-text-show-more-link"]').length > 0,
  };
}

function postOf(a: Element): Post {
  // Every <a> on X has role="link" (incl. the post's own photo links), so only div[role=link] is a quote card.
  const card = a.querySelector('div[role="link"]');
  const quoted = card && postIn(card);
  // An unavailable quoted post renders as an empty card.
  const hasQuote = !!quoted && (!!quoted.author || !!quoted.text || quoted.images.length > 0);
  return { ...postIn(a), quoted: hasQuote ? { ...quoted, quoted: null } : null };
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
/** By prefix: one of the two may stop at "Show more". Media-only posts match only each other. */
function sameText(a: string, b: string): boolean {
  const [x, y] = [collapse(a), collapse(b)];
  return x === y || (!!x && !!y && (x.startsWith(y) || y.startsWith(x)));
}
const sameAs = (copy: Omit<Post, 'quoted'>) => (p: Omit<Post, 'quoted'>) =>
  p.author === copy.author && sameText(p.text, copy.text);

let replied: TargetPost | null = null;

/** Capture-phase click and keydown listener: reads the post the next reply dialog opens for. */
export function trackReplySource(e: Event): void {
  const el = e.target instanceof Element ? e.target : null;
  const opens =
    e instanceof KeyboardEvent
      ? // X's "r" shortcut replies to the post that j/k focused. Typing, or an open dialog, opens none.
        e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !el?.closest(`${EDITABLE}, [role="dialog"]`)
      : !!el?.closest(REPLY_BUTTON);
  if (!opens) return;
  const a = el?.closest(TWEET);
  // Read now: X can unmount the post before Generate, and the narrow layout navigates away.
  replied = a ? withConversation(a) : null;
}

/**
 * The post a dialog's copy stands for: the only match on the page below (the photo viewer's
 * composer opens without a Reply click), else the post whose Reply opened it.
 */
function dialogSource(copy: Omit<Post, 'quoted'>, shown: Element): TargetPost | null {
  const matches = [...document.querySelectorAll(`main ${TWEET}`)].filter(
    (a) => a !== shown && sameAs(copy)(postIn(a)),
  );
  if (matches.length === 1) return withConversation(matches[0]!);
  return replied && sameAs(copy)(replied) ? replied : null;
}

/**
 * On a post's page, the conversation around `a`: the posts above it, oldest first, and its
 * author's run right below it. Timelines show unrelated posts, so they have none.
 */
function conversation(a: Element): { earlier: Element[]; later: Element[] } {
  const main = a.closest('main');
  const focal = main?.querySelector(`${TWEET}[tabindex="-1"]`);
  if (!main || !focal) return { earlier: [], later: [] };
  // "Discover more" (a heading cell) ends the conversation.
  const end = [...main.querySelectorAll(`${CELL} h2`)].find((h) => follows(focal, h));
  const posts = [...main.querySelectorAll(TWEET)].filter((p) => !end || follows(p, end));
  const i = posts.indexOf(a);
  const f = posts.indexOf(focal);
  if (i < 0) return { earlier: [], later: [] };
  // The author's posts right after `from`: the rest of their thread.
  const runAfter = (from: number) => {
    const author = authorOf(posts[from]!);
    const stop = posts.findIndex((p, j) => j > from && authorOf(p) !== author);
    return posts.slice(from + 1, stop < 0 ? posts.length : stop);
  };
  // The posts above the focal one are its parents, and each part of the focal author's thread
  // below it replies to the one before. Other replies hang off the focal post, maybe through
  // replies the page doesn't tell apart from their siblings.
  const inThread = i <= f || runAfter(f).includes(a);
  return { earlier: posts.slice(0, inThread ? i : f + 1), later: runAfter(i) };
}

function withConversation(a: Element): TargetPost {
  const { earlier, later } = conversation(a);
  return { ...postOf(a), earlier: earlier.map(postOf), later: later.map(postOf) };
}

export function getTargetPost(c: Composer): TargetPost | null {
  const shown = targetArticle(c);
  if (!shown) return null;
  if (!needsArticle(c.root)) return withConversation(shown);
  // Dialogs and the compose page show a stripped copy: no media or quote card, pic.x.com links
  // in the text. Its text stays: the page post's may stop at "Show more".
  const copy = postOf(shown);
  const source = dialogSource(copy, shown);
  const { author, text, truncated } = copy;
  return source ? { ...source, author, text, truncated } : { ...copy, earlier: [], later: [] };
}

/** The logged-in user's "@handle", from the side navigation's profile link; "" if not found. */
export function viewerHandle(): string {
  const href = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
  const handle = href?.match(/^\/(\w{1,15})$/)?.[1];
  return handle ? `@${handle}` : '';
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

/** Replaces the composer text; "" empties it. Never submits. Returns false if the text could not be verified. */
export async function setComposerText(ed: HTMLElement, text: string): Promise<boolean> {
  const before = readEditor(ed);
  const done = () => norm(readEditor(ed)) === norm(text);
  const settle = async () => {
    for (let t = 0; t < 1500 && !done(); t += 50) await sleep(50);
    return done();
  };

  selectAll(ed);
  await sleep(120); // Draft syncs its selection on selectionchange, a later task
  let write: Event;
  if (text) {
    const dt = new DataTransfer();
    dt.setData('text/plain', text); // not text/html: Draft prefers it and collapses newlines
    write = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  } else {
    // Draft ignores an empty paste, but deletes the selection on Backspace (it reads keyCode).
    write = new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true });
  }
  ed.dispatchEvent(write);
  // Draft calls preventDefault() before anything else, so its handler ran: never stack a second write.
  if (write.defaultPrevented || readEditor(ed) !== before) return settle();

  // Nobody handled the event (narrow-layout textarea, non-Draft editor): execCommand is reliable there.
  // It targets the focus, not `ed`: a detached or blurred editor would write elsewhere.
  if (document.activeElement !== ed) return false;
  if (text) document.execCommand('insertText', false, text);
  else document.execCommand('delete');
  return settle();
}
