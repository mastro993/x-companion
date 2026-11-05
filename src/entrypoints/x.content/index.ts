import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  type ActionResponse,
  type BackgroundRequest,
  type ContentPush,
  MAX_TEXT,
  type StatusResponse,
} from '@/lib/messages';
import { type Generation, regeneration, samePost } from '@/lib/regenerate';
import {
  closeMenu,
  composerOf,
  type ControlAction,
  controlsOf,
  findComposers,
  getTargetPost,
  injectControls,
  injectedControls,
  readEditor,
  removeInjected,
  renderControls,
  type RunningAction,
  rootOf,
  setComposerText,
  showAlert,
  trackReplySource,
  viewerHandle,
} from '@/lib/x-dom';
import './style.css';

const send = <T>(msg: BackgroundRequest) => browser.runtime.sendMessage(msg) as Promise<T>;

export default defineContentScript({
  matches: ['https://x.com/*'],
  main(ctx) {
    let ready = false;
    // Keyed on composer roots: X can re-mount the toolbar (and so our controls) mid-request.
    const busy = new WeakMap<Element, RunningAction>();
    const busyIn = (el: Element) => {
      const root = rootOf(el);
      return (root && busy.get(root)) ?? null;
    };
    // What Regenerate reruns, keyed like `busy`. A post page's root outlives its post, so each
    // generation also records its page and post.
    const last = new WeakMap<Element, Generation>();
    const render = (wrap: HTMLElement) => {
      const c = composerOf(wrap);
      renderControls(wrap, {
        ready,
        busy: busyIn(wrap),
        hasText: !!c && readEditor(c.editor).trim() !== '',
      });
    };
    const setReady = (value: boolean) => {
      ready = value;
      injectedControls().forEach(render);
    };

    async function onClick(el: HTMLElement, action: ControlAction | null) {
      // ctx.isInvalid checks browser.runtime?.id (orphaned after an extension reload) and runs cleanup.
      if (busyIn(el) || ctx.isInvalid) return;
      if (!ready) {
        // Sent synchronously inside the click so the background keeps the user gesture for sidePanel.open.
        send({ type: 'open-side-panel' }).catch(() => {});
        return;
      }
      const wrap = controlsOf(el);
      const c = composerOf(el);
      if (!action || !wrap || !c) return;
      // A new post has no post to answer.
      const post = action === 'refine-post' ? null : getTargetPost(c);
      if (action !== 'refine-post' && !post) {
        return showAlert(wrap, 'Original post not found. Scroll it into view and retry.');
      }
      const draft = readEditor(c.editor);
      // The controls lag a frame behind typing: never let Generate overwrite a draft, or regenerate nothing.
      if ((action === 'reply') !== !draft.trim()) return render(wrap);
      const { root } = c;
      const page = location.pathname;
      // `input` is what the model works on: for a rerun rewrite, maybe not what the box holds.
      const { action: run, draft: input } =
        action === 'regenerate' ? regeneration(last.get(root), { page, post: post! }, draft) : { action, draft };
      if (run !== 'reply' && input.length > MAX_TEXT) return showAlert(wrap, 'This draft is too long to rewrite.');
      // Regenerating a reply deletes the draft first, so the fresh reply never sees it.
      const clears = action === 'regenerate' && run === 'reply';

      const current = () =>
        wrap.isConnected ? wrap : (injectedControls().find((w) => root.contains(w)) ?? wrap);
      busy.set(root, run);
      render(wrap);
      let start = draft; // what the box holds while the model works
      try {
        if (clears) {
          if (!(await setComposerText(c.editor, ''))) throw new Error("Couldn't clear the reply box. Try again.");
          start = readEditor(c.editor);
        }
        const res = await send<ActionResponse | undefined>(
          run === 'refine-post'
            ? { type: 'refine-post', draft: input }
            : { type: 'run-action', action: run, post: post!, draft: input, me: viewerHandle() },
        );
        if (!res?.ok) throw new Error(res?.error ?? 'No response from x-companion. Reload the page.');
        // X may have re-mounted the controls, the editor or the focal post during the await.
        // Resolve from the root (closest() includes self): new controls may not be injected yet.
        const now = composerOf(root);
        if (!now?.editor.isConnected) throw new Error('The reply box is gone.');
        const again = post && getTargetPost(now);
        if (post && (!again || !samePost(again, post))) {
          throw new Error('The post changed while x-companion was working.');
        }
        if (readEditor(now.editor) !== start) {
          throw new Error('The reply box changed while x-companion was working. Try again.');
        }
        if (res.text !== start && !(await setComposerText(now.editor, res.text))) {
          throw new Error("Couldn't fill the reply box. Try again.");
        }
        if (post && run !== 'refine-post') {
          last.set(root, { action: run, page, post, draft: input, result: readEditor(now.editor) });
        }
      } catch (e) {
        // A failed Regenerate gives the deleted draft back, unless the user has typed since.
        const ed = composerOf(root)?.editor;
        if (clears && ed?.isConnected && !readEditor(ed).trim()) await setComposerText(ed, draft);
        showAlert(current(), e instanceof Error ? e.message : String(e));
      } finally {
        busy.delete(root);
        render(current());
      }
    }

    const onPush = (msg: ContentPush) => {
      if (msg?.type === 'status') setReady(msg.ready === true);
    };
    browser.runtime.onMessage.addListener(onPush);
    send<StatusResponse>({ type: 'get-status' }).then((r) => setReady(r?.ready === true), () => {});

    let queued = false;
    const scan = () => {
      queued = false;
      if (ctx.isInvalid) return;
      for (const c of findComposers()) injectControls(c, onClick);
      injectedControls().forEach(render); // also flips Generate/Rewrite as the box fills or empties
    };
    const queueScan = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(scan);
      }
    };
    // childList: Draft re-renders on every keystroke, and modals mount in #layers under body.
    // input: the narrow layout's textarea changes without any DOM mutation.
    const observer = new MutationObserver(queueScan);
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.addEventListener(document, 'input', queueScan, { capture: true });
    // Before X opens the reply dialog: its copy of the post lacks the media and the quoted post.
    ctx.addEventListener(document, 'click', trackReplySource, { capture: true });
    ctx.addEventListener(document, 'keydown', trackReplySource, { capture: true });
    // Escape would also reach X, which closes the reply dialog: let it close only our menu.
    ctx.addEventListener(
      window,
      'keydown',
      (e) => {
        if (e.key === 'Escape' && closeMenu()) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
    scan();

    ctx.onInvalidated(() => {
      observer.disconnect();
      removeInjected();
      browser.runtime?.onMessage.removeListener(onPush); // runtime can be gone when orphaned
    });
  },
});
