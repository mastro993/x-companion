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
  trackReplySource,
  viewerHandle,
} from '../x-dom';

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
const cell = (html: string) => `<div data-testid="cellInnerDiv">${html}</div>`;
const pbs = (id: string, query = 'format=webp&name=small') => `https://pbs.twimg.com/media/${id}?${query}`;
const sent = (id: string) => pbs(id, 'format=jpg&name=medium');
const photo = (src: string, alt = 'Image') =>
  `<a href="/x/status/1/photo/1" role="link"><div data-testid="tweetPhoto"><img alt="${alt}" src="${src}"></div></a>`;
const quote = (handle: string, body: string) =>
  `<div role="link" tabindex="0"><div data-testid="User-Name"><span>${handle} name</span><span>@${handle}</span></div>${body}</div>`;
const replyButton = '<button data-testid="reply" type="button"><svg></svg></button>';

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
    expect(getTargetPost(composerOf(wrap!)!)).toMatchObject({
      author: '@alice',
      text: 'Focal',
      earlier: [{ author: '@bob', text: 'Parent' }],
      later: [],
    });
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
  const pills = () =>
    [...wrap.querySelectorAll<HTMLButtonElement>('.xc-reply-btn:not(.xc-reply-btn--icon)')].filter((b) => !b.hidden);
  const regenerate = () => wrap.querySelector<HTMLButtonElement>('.xc-reply-btn--icon')!;
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

  it('offers Generate on an empty box, and Regenerate and Rewrite, with its menu, once the box has text', () => {
    renderControls(wrap, ready);
    expect(shown().textContent).toBe('Generate');
    expect(shown().getAttribute('aria-label')).toBe('Generate reply with x-companion');
    expect(regenerate().hidden).toBe(true);

    renderControls(wrap, { ...ready, hasText: true });
    expect(shown().textContent).toBe('Rewrite');
    expect(shown().popoverTargetElement).toBe(menu());
    expect([...menu().children].map((i) => i.textContent)).toEqual(['Polish', 'Punchier', 'Match style']);
    expect(regenerate().hidden).toBe(false);
    expect(regenerate().nextElementSibling).toBe(shown());
    expect(regenerate().textContent).toBe('');
    expect(regenerate().getAttribute('aria-label')).toBe('Regenerate reply with x-companion');
    expect(regenerate().title).toBe('Regenerate');
  });

  it('setup: greyed with a hint, and the Rewrite menu stays shut', () => {
    renderControls(wrap, { ...ready, ready: false, hasText: true });
    for (const btn of [shown(), regenerate()]) {
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.title).toBe('x-companion: finish setup in the side panel');
    }
    expect(shown().popoverTargetElement).toBeNull();
    // The click reaches the content script, which opens the side panel.
    expect(trustedClick(shown()).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledWith(shown(), null);

    renderControls(wrap, { ...ready, hasText: true });
    expect(regenerate().hasAttribute('aria-disabled')).toBe(false);
    expect(regenerate().title).toBe('Regenerate');
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

  it('busy: Regenerate keeps its place and names itself on the Rewrite pill', () => {
    renderControls(wrap, { ...ready, busy: 'regenerate', hasText: false });
    expect(regenerate().hidden).toBe(false);
    expect(shown().textContent).toBe('Regenerating…');
    expect(shown().getAttribute('aria-label')).toBe('Regenerating reply with x-companion');
    expect(shown().popoverTargetElement).toBeNull();
    expect(regenerate().getAttribute('aria-label')).toBe('Regenerating reply with x-companion');
    for (const btn of [shown(), regenerate()]) expect(btn.getAttribute('aria-busy')).toBe('true');

    renderControls(wrap, { ...ready, hasText: true });
    expect(shown().textContent).toBe('Rewrite');
    expect(regenerate().getAttribute('aria-label')).toBe('Regenerate reply with x-companion');
    expect(regenerate().hasAttribute('aria-busy')).toBe(false);
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

  it('Regenerate runs its own action', () => {
    renderControls(wrap, { ...ready, hasText: true });
    expect(trustedClick(regenerate()).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledExactlyOnceWith(regenerate(), 'regenerate');
  });

  it('ignores untrusted (scripted) clicks', () => {
    renderControls(wrap, ready);
    const item = menu().firstElementChild as HTMLElement;
    for (const el of [shown(), regenerate(), item]) {
      el.click();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(onClick).not.toHaveBeenCalled();
    trustedClick(shown());
    expect(onClick).toHaveBeenCalledExactlyOnceWith(shown(), 'reply');
  });
});

describe('getTargetPost', () => {
  it('keeps emoji and own media, separates the quote, strips pic.x.com, flags truncation', () => {
    const body = `
      <div data-testid="tweetText"><span>Hello </span><img alt="👋" src="e.svg"><span> world https://</span><a href="https://pic.x.com/AbC123">pic.x.com/AbC123</a></div>
      <a href="/demo_writer" role="link" data-testid="tweet-text-show-more-link">Show more</a>
      ${photo(pbs('cat'), 'A cat')}
      <div data-testid="tweetPhoto"><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/amplify_video_thumb/9/img/k?format=webp&name=small"></video>
        <img alt="" src="https://pbs.twimg.com/amplify_video_thumb/9/img/k?format=jpg&name=360x360"></div></div>
      ${photo('https://pbs.twimg.com/tweet_video_thumb/Gif.jpg', 'Embedded video')}
      <img alt="avatar" src="https://pbs.twimg.com/profile_images/1/a_normal.jpg">
      ${quote('bob', `${text('Quoted take')}${photo(pbs('quoted'), 'Quoted photo')}<a data-testid="tweet-text-show-more-link">Show more</a>`)}`;
    page('/compose/post', `<div role="dialog">${tweet('alice', '111', body)}${editor()}${toolbar('tweetButton')}</div>`);
    const [c] = findReplyComposers();
    expect(getTargetPost(c!)).toEqual({
      author: '@alice',
      text: 'Hello 👋 world',
      images: [
        { url: sent('cat'), alt: 'A cat', video: false },
        { url: 'https://pbs.twimg.com/amplify_video_thumb/9/img/k?format=jpg&name=medium', alt: '', video: true },
        { url: 'https://pbs.twimg.com/tweet_video_thumb/Gif.jpg', alt: 'Embedded video', video: true },
      ],
      truncated: true,
      quoted: {
        author: '@bob',
        text: 'Quoted take',
        images: [{ url: sent('quoted'), alt: 'Quoted photo', video: false }],
        truncated: true,
        quoted: null,
      },
      earlier: [],
      later: [],
    });
  });

  const dialogPost = (body: string) => {
    page('/compose/post', `<div role="dialog"><article data-testid="tweet">${body}</article>${editor()}${toolbar('tweetButton')}</div>`);
    return getTargetPost(findReplyComposers()[0]!);
  };

  it('span-only header (reply dialog copy): author from the @handle after the display name', () => {
    const header = '<div data-testid="User-Name"><span>Alice | @acme</span><span>@alice</span><span>·</span><time>1h</time></div>';
    expect(dialogPost(header + text('Hi'))?.author).toBe('@alice');
  });

  it("the quote's Show more does not flag the post as truncated", () => {
    const card = `<div role="link">${text('Long quoted')}<a href="/bob" data-testid="tweet-text-show-more-link">Show more</a></div>`;
    expect(dialogPost(text('Short') + card)?.truncated).toBe(false);
  });

  it('an empty quote card (unavailable post) is no quote, and non-pbs media is dropped', () => {
    const post = dialogPost(
      text('Look') +
        photo('blob:https://x.com/1') +
        photo('https://video.twimg.com/a.jpg') +
        '<div role="link"><span>This post is unavailable.</span></div>',
    );
    expect(post).toMatchObject({ images: [], quoted: null });
  });

  describe('post page conversation', () => {
    const thread = (...cells: string[]) =>
      page('/alice/status/3', '', cells.map(cell).join('') + editor() + toolbar('tweetButtonInline'));
    const target = () => getTargetPost(findReplyComposers()[0]!)!;

    it('sends the posts above as earlier, and the author’s run right below as later', () => {
      thread(
        tweet('root', '1', text('Root') + quote('carol', text('Quoted in thread'))),
        tweet('alice', '2', text('Part 1') + photo(pbs('p1'))),
        tweet('alice', '3', text('Part 2'), 'tabindex="-1"'),
        tweet('alice', '4', text('Part 3')),
        tweet('alice', '5', text('Part 4')),
        tweet('dave', '6', text('Nice thread')),
        tweet('alice', '7', text('Thanks Dave')),
      );
      const post = target();
      expect(post.text).toBe('Part 2');
      expect(post.earlier.map((p) => [p.author, p.text])).toEqual([
        ['@root', 'Root'],
        ['@alice', 'Part 1'],
      ]);
      expect(post.earlier[0]!.quoted).toMatchObject({ author: '@carol', text: 'Quoted in thread' });
      expect(post.earlier[1]!.images).toEqual([{ url: sent('p1'), alt: 'Image', video: false }]);
      expect(post.later.map((p) => p.text)).toEqual(['Part 3', 'Part 4']);
    });

    it('stops at "Discover more"', () => {
      thread(
        tweet('alice', '3', text('Focal'), 'tabindex="-1"'),
        tweet('alice', '4', text('Follow-up')),
        '<h2 role="heading"><span>Discover more</span></h2>',
        tweet('alice', '9', text('Unrelated post')),
      );
      expect(target().later.map((p) => p.text)).toEqual(['Follow-up']);
    });

    it('a reply dialog over the page: a reply below the focal post gets the focal chain', () => {
      page(
        '/compose/post',
        `<div role="dialog"><article data-testid="tweet" tabindex="-1"><div data-testid="User-Name"><span>@dave</span></div>${text('Reply below')}</article>${editor()}${toolbar('tweetButton')}</div>`,
        [
          tweet('root', '1', text('Root')),
          tweet('alice', '3', text('Focal'), 'tabindex="-1"'),
          tweet('bob', '5', text('Another reply')),
          tweet('dave', '6', text('Reply below') + replyButton + photo(pbs('d'))),
        ]
          .map(cell)
          .join(''),
      );
      const btn = document.querySelectorAll<HTMLElement>('main [data-testid="reply"]')[0]!;
      trackReplySource({ target: btn.querySelector('svg') } as unknown as Event);
      const post = getTargetPost(findReplyComposers()[0]!)!;
      expect(post.images).toEqual([{ url: sent('d'), alt: 'Image', video: false }]);
      expect(post.earlier.map((p) => p.text)).toEqual(['Root', 'Focal']);
    });
    const dialogOver = (copyHandle: string, copyText: string, cells: string[]) =>
      page(
        '/compose/post',
        `<div role="dialog"><article data-testid="tweet" tabindex="-1"><div data-testid="User-Name"><span>@${copyHandle}</span></div>${text(copyText)}</article>${editor()}${toolbar('tweetButton')}</div>`,
        cells.map(cell).join(''),
      );
    const clickReplyOn = (postText: string) => {
      const a = [...document.querySelectorAll('main article')].find((x) => x.textContent?.includes(postText))!;
      trackReplySource({ target: a.querySelector('[data-testid="reply"]') } as unknown as Event);
    };

    it("a reply dialog over the page: a later part of the focal author's thread keeps the parts above it", () => {
      dialogOver('alice', 'Part 3', [
        tweet('alice', '1', text('Part 1'), 'tabindex="-1"'),
        tweet('alice', '2', text('Part 2') + replyButton),
        tweet('alice', '3', text('Part 3') + replyButton),
        tweet('alice', '4', text('Part 4')),
        tweet('bob', '5', text('Reply')),
      ]);
      clickReplyOn('Part 3');
      const post = getTargetPost(findReplyComposers()[0]!)!;
      expect(post.earlier.map((p) => p.text)).toEqual(['Part 1', 'Part 2']);
      expect(post.later.map((p) => p.text)).toEqual(['Part 4']);
    });

    it('a reply dialog over the page: a post above the focal one gets only the posts above it', () => {
      dialogOver('bob', 'Parent', [
        tweet('root', '1', text('Root')),
        tweet('bob', '2', text('Parent') + replyButton),
        tweet('alice', '3', text('Focal'), 'tabindex="-1"'),
      ]);
      clickReplyOn('Parent');
      expect(getTargetPost(findReplyComposers()[0]!)).toMatchObject({
        earlier: [{ text: 'Root' }],
        later: [],
      });
    });
  });

  describe('reply dialog over a timeline', () => {
    const copy = (body: string) =>
      `<div role="dialog"><article data-testid="tweet" tabindex="-1"><div data-testid="User-Name"><span>Alice</span><span>@alice</span></div>${body}</article>${editor()}${toolbar('tweetButton')}</div>`;
    // Unrelated neighbours, the next one by the same author.
    const timeline = (body: string, author = 'alice') =>
      [
        tweet('zed', '0', text('Above')),
        tweet(author, '111', body + replyButton, 'tabindex="0"'),
        tweet(author, '112', text('Next')),
      ]
        .map(cell)
        .join('');
    const clickReply = (i = 0) => {
      const btn = document.querySelectorAll<HTMLElement>('main [data-testid="reply"]')[i]!;
      trackReplySource({ target: btn } as unknown as Event);
    };
    const target = () => getTargetPost(findReplyComposers()[0]!)!;

    it('takes the media and quoted post from the post whose Reply was clicked, the text from the copy', () => {
      page(
        '/compose/post',
        copy(text('Long post, in full https://pic.x.com/xyz')),
        timeline(
          text('Long post,') +
            '<a data-testid="tweet-text-show-more-link">Show more</a>' +
            photo(pbs('own')) +
            quote('bob', text('Quoted')),
        ),
      );
      clickReply();
      expect(target()).toEqual({
        author: '@alice',
        text: 'Long post, in full',
        images: [{ url: sent('own'), alt: 'Image', video: false }],
        truncated: false,
        quoted: { author: '@bob', text: 'Quoted', images: [], truncated: false, quoted: null },
        // A timeline isn't a conversation: the post above is unrelated.
        earlier: [],
        later: [],
      });
    });

    it('without a Reply click (the photo viewer), takes the only matching post on the page', () => {
      page('/compose/post', copy(text('Hello')), timeline(text('Hello') + photo(pbs('own'))));
      expect(target().images).toHaveLength(1);
      page('/compose/post', copy(text('Hello')), timeline(text('Something else') + photo(pbs('own'))));
      expect(target().images).toEqual([]);
      page('/compose/post', copy(text('Hello')), timeline(text('Hello') + photo(pbs('own')), 'bob'));
      expect(target().images).toEqual([]); // same text, another author
    });

    // Two media-only posts by the same author both match a media-only copy.
    const twins = [1, 2].map((n) => tweet('alice', `${n}`, photo(pbs(`p${n}`)) + replyButton)).map(cell).join('');
    const urls = () => target().images.map((i) => i.url);

    it('when several posts match, takes the one whose Reply was clicked, even after X re-renders it', () => {
      page('/compose/post', copy(''), twins);
      expect(urls()).toEqual([]);
      clickReply(1);
      expect(urls()).toEqual([sent('p2')]);
      document.querySelector('main')!.innerHTML = twins;
      expect(urls()).toEqual([sent('p2')]);
    });

    it('narrow layout: the post read at the Reply click survives the navigation to /compose/post', () => {
      page('/home', '', timeline(text('Hello') + photo(pbs('own'))));
      clickReply();
      const shownCopy = `<article data-testid="tweet" tabindex="-1"><div data-testid="User-Name"><span>@alice</span></div>${text('Hello')}</article>`;
      page('/compose/post', '', shownCopy + editor() + toolbar('tweetButton'));
      expect(urls()).toEqual([sent('own')]);
    });

    it("X's r shortcut replies to the focused post; elsewhere it forgets the last clicked one", () => {
      page('/compose/post', copy(''), twins);
      const press = (on: Element | null) => {
        const e = new KeyboardEvent('keydown', { key: 'r' });
        Object.defineProperty(e, 'target', { value: on });
        trackReplySource(e);
      };
      press(document.querySelectorAll('main article')[0]!);
      expect(urls()).toEqual([sent('p1')]);
      press(document.body);
      expect(urls()).toEqual([]);
      clickReply(1);
      press(document.querySelector('[contenteditable]')); // typing an r doesn't count
      press(document.querySelector('[role="dialog"] article')); // nor does a key in the open dialog
      expect(urls()).toEqual([sent('p2')]);
    });

    it('matches a media-only post only to a media-only copy', () => {
      page('/compose/post', copy(text('Caption')), timeline(photo(pbs('own'))));
      clickReply();
      expect(target().images).toEqual([]);
      page('/compose/post', copy(''), timeline(photo(pbs('own'))));
      clickReply();
      expect(target().images).toHaveLength(1);
    });
  });
});

describe('viewerHandle', () => {
  it.each([
    ['<nav><a data-testid="AppTabBar_Profile_Link" href="/me_123">Profile</a></nav>', '@me_123'],
    ['<nav><a data-testid="AppTabBar_Profile_Link" href="/me/likes">Profile</a></nav>', ''],
    ['<nav></nav>', ''],
  ])('%s -> %j', (nav, handle) => {
    document.body.innerHTML = nav;
    expect(viewerHandle()).toBe(handle);
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
