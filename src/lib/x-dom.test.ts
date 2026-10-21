// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composerOf,
  type ControlsState,
  findReplyComposers,
  getTargetPost,
  injectControls,
  injectedControls,
  readEditor,
  renderControls,
  setComposerText,
  showAlert,
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
const scan = () => findReplyComposers().map((c) => injectControls(c, () => {}));

// happy-dom has the popover attribute but not its methods.
HTMLElement.prototype.hidePopover = vi.fn();

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findReplyComposers + injectControls', () => {
  it('reply dialog: injects before Reply, targets the original above the editor', () => {
    page(
      '/compose/post',
      `<div role="dialog">${tweet('alice', '111', text('Original'), 'tabindex="-1"')}${editor()}${toolbar('tweetButton')}</div>`,
      tweet('home', '1', text('Timeline post'), 'tabindex="0"'),
    );
    const [wrap] = scan();
    const host = document.querySelector('.host')!;
    expect(host.firstElementChild).toBe(wrap);
    expect(host.lastElementChild?.getAttribute('data-testid')).toBe('tweetButton');
    expect(getTargetPost(composerOf(wrap!)!)?.text).toBe('Original');
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
    const [wrap, ...rest] = scan();
    expect(rest).toEqual([]);
    expect(getTargetPost(composerOf(wrap!)!)).toMatchObject({ author: '@alice', text: 'Focal' });
  });

  it('narrow layout: /compose/post rendered as a page in main gets a button', () => {
    page('/compose/post', '', tweet('alice', '111', text('Original')) + editor() + toolbar('tweetButton'));
    const [wrap] = scan();
    expect(wrap).toBeTruthy();
    expect(getTargetPost(composerOf(wrap!)!)?.author).toBe('@alice');
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
    expect(injectedControls()).toHaveLength(1);
    document.querySelector('[data-xc-reply]')!.remove();
    scan();
    expect(injectedControls()).toHaveLength(1);
  });

  it('showAlert flips below the controls when there is no room above', () => {
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    const [wrap] = scan() as HTMLElement[];
    wrap!.getBoundingClientRect = () => ({ top: 400 }) as DOMRect;
    showAlert(wrap!, 'Oops');
    expect(wrap!.querySelector('.xc-reply-alert--below')).toBeNull();
    wrap!.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    showAlert(wrap!, 'Oops');
    expect(wrap!.querySelectorAll('.xc-reply-alert')).toHaveLength(1);
    expect(wrap!.querySelector('.xc-reply-alert--below')).not.toBeNull();
  });
});

describe('controls', () => {
  const onClick = vi.fn();
  let wrap: HTMLElement;
  beforeEach(() => {
    onClick.mockClear();
    page('/alice/status/222', '', tweet('alice', '222', text('Focal')) + editor() + toolbar('tweetButtonInline'));
    wrap = injectControls(findReplyComposers()[0]!, onClick)!;
  });

  const ready: ControlsState = { ready: true, busy: null, hasText: false };
  const pills = () => [...wrap.querySelectorAll<HTMLButtonElement>('.xc-reply-btn')].filter((b) => !b.hidden);
  const shown = () => {
    const [btn, ...rest] = pills();
    expect(rest).toEqual([]);
    return btn!;
  };
  const menu = () => wrap.querySelector<HTMLElement>('.xc-menu')!;
  const trustedClick = (el: Element) => {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'isTrusted', { value: true });
    el.dispatchEvent(e);
    return e;
  };

  it('offers Generate on an empty box and Rewrite, with its menu, once the box has text', () => {
    renderControls(wrap, ready);
    expect(shown().textContent).toBe('Generate');
    expect(shown().getAttribute('aria-label')).toBe('Generate reply with x-companion');

    renderControls(wrap, { ...ready, hasText: true });
    expect(shown().textContent).toBe('Rewrite');
    expect(shown().popoverTargetElement).toBe(menu());
    expect([...menu().children].map((i) => i.textContent)).toEqual(['Polish', 'Punchier', 'Match style']);
  });

  it('setup: greyed with a hint, and the Rewrite menu stays shut', () => {
    renderControls(wrap, { ...ready, ready: false, hasText: true });
    expect(shown().getAttribute('aria-disabled')).toBe('true');
    expect(shown().title).toBe('x-companion: finish setup in the side panel');
    expect(shown().popoverTargetElement).toBeNull();
    // The click reaches the content script, which opens the side panel.
    expect(trustedClick(shown()).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledWith(shown(), null);
  });

  it('busy: the running action shows on its pill, whatever the box holds', () => {
    renderControls(wrap, { ...ready, busy: 'polish', hasText: false });
    expect(shown().textContent).toBe('Polishing…');
    expect(shown().getAttribute('aria-busy')).toBe('true');
    expect(shown().getAttribute('aria-label')).toBe('Rewriting draft with x-companion');
    expect(shown().popoverTargetElement).toBeNull();

    renderControls(wrap, { ...ready, busy: 'reply', hasText: true });
    expect(shown().textContent).toBe('Generating…');
    renderControls(wrap, ready);
    expect(shown().hasAttribute('aria-busy')).toBe(false);
    expect(shown().hasAttribute('aria-disabled')).toBe(false);
  });

  it('re-rendering an unchanged state causes no childList mutation', () => {
    renderControls(wrap, { ...ready, hasText: true });
    const observer = new MutationObserver(() => {});
    observer.observe(wrap, { childList: true, subtree: true });
    renderControls(wrap, { ...ready, hasText: true });
    expect(observer.takeRecords()).toEqual([]);
  });

  it('armed Rewrite pill leaves the click to the native popover toggle', () => {
    renderControls(wrap, { ...ready, hasText: true });
    expect(trustedClick(shown()).defaultPrevented).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('menu items run their action and close the menu', () => {
    renderControls(wrap, { ...ready, hasText: true });
    const punchier = [...menu().children].find((i) => i.textContent === 'Punchier')!;
    vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
    trustedClick(punchier);
    expect(onClick).toHaveBeenCalledWith(punchier, 'punchier');
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });

  it('ignores untrusted (scripted) clicks', () => {
    renderControls(wrap, ready);
    const item = menu().firstElementChild as HTMLElement;
    for (const el of [shown(), item]) {
      el.click();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(onClick).not.toHaveBeenCalled();
    trustedClick(shown());
    expect(onClick).toHaveBeenCalledExactlyOnceWith(shown(), 'reply');
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

describe('readEditor', () => {
  it('reads Draft blocks one per line, and an empty Draft editor as ""', () => {
    page('/home', '', editor());
    const ed = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    expect(readEditor(ed)).toBe('');
    ed.firstElementChild!.innerHTML = '<div data-block="true"><span>One</span></div><div data-block="true"><span></span></div><div data-block="true"><span>Three</span></div>';
    expect(readEditor(ed)).toBe('One\n\nThree');
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
