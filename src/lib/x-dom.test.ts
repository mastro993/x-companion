// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composerOf,
  findReplyComposers,
  getTargetPost,
  injectButton,
  injectedButtons,
  setComposerText,
  showAlert,
  updateButton,
} from './x-dom';

// Hand-written minimal fixtures mimicking X's 2026 DOM (testids, Draft.js blocks, #layers dialogs).
const editor = (testid = 'tweetTextarea_0') => `
  <div data-testid="${testid}_label"><div class="DraftEditor-root">
    <div class="public-DraftEditor-content" contenteditable="true" role="textbox" data-testid="${testid}">
      <div data-contents="true"><div data-block="true"><span><br data-text="true"></span></div></div>
    </div>
  </div></div>`;
const toolbar = (submit: string) =>
  `<div data-testid="toolBar"><div data-testid="ScrollSnap-List" role="tablist"></div>
   <div class="host"><button data-testid="${submit}">Reply</button></div></div>`;
const tweet = (handle: string, id: string, body: string, attrs = '') => `
  <article data-testid="tweet" ${attrs}>
    <div data-testid="User-Name">
      <div><a href="/${handle}" role="link"><span>${handle} name</span></a></div>
      <div><a href="/${handle}" role="link">@${handle}</a><a href="/${handle}/status/${id}" role="link"><time>1h</time></a></div>
    </div>
    ${body}
  </article>`;
const text = (t: string) => `<div data-testid="tweetText"><span>${t}</span></div>`;

function page(path: string, layers: string, main = '') {
  history.replaceState(null, '', path);
  document.body.innerHTML = `<div id="layers">${layers}</div><div><main>${main}</main></div>`;
}
const scan = () => findReplyComposers().map((c) => injectButton(c, () => {}));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findReplyComposers + injectButton', () => {
  it('reply dialog: injects before Reply, targets the original above the editor', () => {
    page(
      '/compose/post',
      `<div role="dialog">${tweet('alice', '111', text('Original'), 'tabindex="-1"')}${editor()}${toolbar('tweetButton')}</div>`,
      tweet('home', '1', text('Timeline post'), 'tabindex="0"'),
    );
    const [btn] = scan();
    const host = document.querySelector('.host')!;
    expect(host.firstElementChild?.firstElementChild).toBe(btn);
    expect(host.lastElementChild?.getAttribute('data-testid')).toBe('tweetButton');
    expect(getTargetPost(composerOf(btn!)!)?.text).toBe('Original');
  });

  it('status page inline composer: focal article from main, not a #layers article', () => {
    page(
      '/alice/status/222',
      tweet('decoy', '222', text('Layer copy'), 'tabindex="-1"'),
      tweet('bob', '111', text('Parent'), 'tabindex="0"') +
        tweet('alice', '222', text('Focal'), 'tabindex="-1"') +
        editor() +
        toolbar('tweetButtonInline') +
        tweet('carol', '333', text('Reply below'), 'tabindex="0"'),
    );
    const [btn, ...rest] = scan();
    expect(rest).toEqual([]);
    expect(getTargetPost(composerOf(btn!)!)).toMatchObject({ author: '@alice', text: 'Focal' });
  });

  it('narrow layout: /compose/post rendered as a page in main gets a button', () => {
    page('/compose/post', '', tweet('alice', '111', text('Original')) + editor() + toolbar('tweetButton'));
    const [btn] = scan();
    expect(btn).toBeTruthy();
    expect(getTargetPost(composerOf(btn!)!)?.author).toBe('@alice');
  });

  it.each([
    ['new-post dialog', '/compose/post', `<div role="dialog">${editor()}${toolbar('tweetButton')}</div>`, ''],
    [
      'quote dialog',
      '/compose/post',
      `<div role="dialog">${editor()}<div data-testid="attachments">${tweet('bob', '9', text('Quoted'))}</div>${toolbar('tweetButton')}</div>`,
      '',
    ],
    ['home composer', '/home', '', editor() + toolbar('tweetButtonInline') + tweet('bob', '9', text('Feed'))],
    [
      'home composer under a photo viewer',
      '/bob/status/9/photo/1',
      '<div role="dialog"></div>',
      editor() + toolbar('tweetButtonInline') + tweet('bob', '9', text('Feed')),
    ],
  ])('%s: no button', (_, path, layers, main) => {
    page(path, layers, main);
    expect(findReplyComposers()).toEqual([]);
  });

  it('is idempotent and re-injects after X drops our node', () => {
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    scan();
    expect(scan()).toEqual([null]);
    expect(injectedButtons()).toHaveLength(1);
    document.querySelector('[data-xc-reply]')!.remove();
    scan();
    expect(injectedButtons()).toHaveLength(1);
  });

  it('ignores untrusted (scripted) clicks', () => {
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    const onClick = vi.fn();
    const btn = injectButton(findReplyComposers()[0]!, onClick)!;
    btn.click();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
    const real = new MouseEvent('click');
    Object.defineProperty(real, 'isTrusted', { value: true });
    btn.dispatchEvent(real);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('showAlert flips below the button when there is no room above', () => {
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    const [btn] = scan() as HTMLButtonElement[];
    const wrap = btn!.parentElement!;
    wrap.getBoundingClientRect = () => ({ top: 400 }) as DOMRect;
    showAlert(btn!, 'Oops');
    expect(wrap.querySelector('.xc-reply-alert--below')).toBeNull();
    wrap.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    showAlert(btn!, 'Oops');
    expect(wrap.querySelector('.xc-reply-alert--below')).not.toBeNull();
  });

  it('updateButton reflects ready / setup / busy', () => {
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    const [btn] = scan() as HTMLButtonElement[];
    updateButton(btn!, 'setup');
    expect(btn!.getAttribute('aria-disabled')).toBe('true');
    expect(btn!.title).toBe('x-companion: finish setup in the side panel');
    updateButton(btn!, 'busy');
    expect(btn!.hasAttribute('aria-disabled')).toBe(false);
    expect(btn!.getAttribute('aria-busy')).toBe('true');
    expect(btn!.textContent).toBe('Generating…');
    updateButton(btn!, 'ready');
    expect(btn!.hasAttribute('aria-busy')).toBe(false);
    expect(btn!.getAttribute('aria-label')).toBe('Generate reply with x-companion');
  });
});

describe('getTargetPost', () => {
  it('keeps emoji and own photos, separates the quote, strips pic.x.com, flags truncation', () => {
    const body = `
      <div data-testid="tweetText"><span>Hello </span><img alt="👋" src="e.svg"><span> world pic.x.com/AbC123</span></div>
      <a href="/demo_writer" role="link" data-testid="tweet-text-show-more-link">Show more</a>
      <a href="/alice/status/111/photo/1" role="link"><div data-testid="tweetPhoto"><img alt="A cat" src="p.jpg"></div></a>
      <div role="link" tabindex="0">
        <div data-testid="User-Name"><a href="/bob" role="link">@bob</a></div>
        ${text('Quoted take')}
        <div data-testid="tweetPhoto"><img alt="Quoted photo" src="q.jpg"></div>
      </div>`;
    page('/compose/post', `<div role="dialog">${tweet('alice', '111', body)}${editor()}${toolbar('tweetButton')}</div>`);
    const [c] = findReplyComposers();
    expect(getTargetPost(c!)).toEqual({
      author: '@alice',
      text: 'Hello 👋 world',
      quoted: 'Quoted take',
      images: ['A cat'],
      truncated: true,
    });
  });

  const dialogPost = (body: string) => {
    page('/compose/post', `<div role="dialog"><article data-testid="tweet">${body}</article>${editor()}${toolbar('tweetButton')}</div>`);
    return getTargetPost(findReplyComposers()[0]!);
  };

  it('span-only header (reply dialog copy): author from the @handle text', () => {
    const header = '<div data-testid="User-Name"><span>Alice</span><span>@alice</span><span>·</span><time>1h</time></div>';
    expect(dialogPost(header + text('Hi'))?.author).toBe('@alice');
  });

  it("the quote's Show more does not flag the post as truncated", () => {
    const quote = `<div role="link">${text('Long quoted')}<a href="/bob" data-testid="tweet-text-show-more-link">Show more</a></div>`;
    expect(dialogPost(text('Short') + quote)?.truncated).toBe(false);
  });
});

describe('setComposerText', () => {
  const exec = vi.fn((_cmd: string, _ui?: boolean, _value?: string) => true);
  beforeEach(() => {
    vi.useFakeTimers();
    exec.mockClear();
    document.execCommand = exec as typeof document.execCommand;
  });
  afterEach(() => vi.useRealTimers());

  const run = async (ed: HTMLElement, value: string) => {
    const p = setComposerText(ed, value);
    await vi.runAllTimersAsync();
    return p;
  };
  const insertTextCalls = () => exec.mock.calls.filter(([cmd]) => cmd === 'insertText');

  /** Fake Draft editor: takes the paste and renders `transform(text)` as one [data-block] per line. */
  function draftEditor(transform: ((t: string) => string) | null) {
    page('/home', '', editor());
    const ed = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      if (!transform) return; // Draft "silently no-ops on some composer states"
      const lines = transform(e.clipboardData!.getData('text/plain')).split('\n');
      ed.firstElementChild!.innerHTML = lines
        .map((l) => `<div data-block="true"><span>${l}</span></div>`)
        .join('');
    });
    return ed;
  }

  it('pastes multi-line text and verifies it block by block', async () => {
    const ed = draftEditor((t) => t);
    expect(await run(ed, 'First line\n\nThird line')).toBe(true);
    expect(insertTextCalls()).toEqual([]);
  });

  it('defaultPrevented paste that changed nothing: no fallback write, reports failure', async () => {
    const ed = draftEditor(null);
    expect(await run(ed, 'Hello')).toBe(false);
    expect(insertTextCalls()).toEqual([]);
  });

  it('fails when the paste lost the line breaks', async () => {
    const ed = draftEditor((t) => t.replace(/\n+/g, ' '));
    expect(await run(ed, 'One\nTwo')).toBe(false);
  });

  it('unhandled paste (narrow-layout textarea): falls back to insertText once', async () => {
    page('/compose/post', '', '<div data-testid="tweetTextarea_0"><textarea></textarea></div>');
    const ta = document.querySelector('textarea')!;
    exec.mockImplementation((cmd, _ui, value) => {
      if (cmd === 'insertText') ta.value = value ?? '';
      return true;
    });
    expect(await run(ta, 'Line 1\nLine 2')).toBe(true);
    expect(insertTextCalls()).toHaveLength(1);
  });

  it('unfocused (detached) editor: no insertText, since it would write into whatever has focus', async () => {
    expect(await run(document.createElement('textarea'), 'Hello')).toBe(false);
    expect(insertTextCalls()).toEqual([]);
  });
});
