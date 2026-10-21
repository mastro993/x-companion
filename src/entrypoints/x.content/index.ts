import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type {
  BackgroundRequest,
  ContentPush,
  GenerateReplyResponse,
  StatusResponse,
} from '@/lib/messages';
import {
  composerOf,
  findReplyComposers,
  getTargetPost,
  injectButton,
  injectedButtons,
  removeInjected,
  rootOf,
  setComposerText,
  showAlert,
  updateButton,
} from '@/lib/x-dom';
import './style.css';

const send = <T>(msg: BackgroundRequest) => browser.runtime.sendMessage(msg) as Promise<T>;

export default defineContentScript({
  matches: ['https://x.com/*'],
  main(ctx) {
    let ready = false;
    // Keyed on composer roots: X can re-mount the toolbar (and so our button) mid-generation.
    const busy = new WeakSet<Element>();
    const isBusy = (btn: HTMLButtonElement) => {
      const root = rootOf(btn);
      return !!root && busy.has(root);
    };
    const render = (btn: HTMLButtonElement) =>
      updateButton(btn, isBusy(btn) ? 'busy' : ready ? 'ready' : 'setup');
    const setReady = (value: boolean) => {
      ready = value;
      injectedButtons().forEach(render);
    };

    async function onClick(btn: HTMLButtonElement) {
      // ctx.isInvalid checks browser.runtime?.id (orphaned after an extension reload) and runs cleanup.
      if (isBusy(btn) || ctx.isInvalid) return;
      if (!ready) {
        // Sent synchronously inside the click so the background keeps the user gesture for sidePanel.open.
        send({ type: 'open-side-panel' }).catch(() => {});
        return;
      }
      const c = composerOf(btn);
      const post = c && getTargetPost(c);
      if (!c || !post) return showAlert(btn, 'Original post not found. Scroll it into view and retry.');

      const { root } = c;
      const current = () =>
        btn.isConnected ? btn : (injectedButtons().find((b) => root.contains(b)) ?? btn);
      busy.add(root);
      render(btn);
      try {
        const res = await send<GenerateReplyResponse | undefined>({ type: 'generate-reply', post });
        if (!res?.ok) throw new Error(res?.error ?? 'No response from x-companion. Reload the page.');
        // X may have re-mounted the button, the editor or the focal post during the await (closest() includes self).
        const now = composerOf(btn.isConnected ? btn : root);
        if (!now?.editor.isConnected) throw new Error('The reply box is gone.');
        const again = getTargetPost(now);
        if (!again || again.author !== post.author || again.text !== post.text) {
          throw new Error('The post changed while generating.');
        }
        if (!(await setComposerText(now.editor, res.text))) {
          throw new Error("Couldn't fill the reply box. Try again.");
        }
      } catch (e) {
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
      for (const c of findReplyComposers()) {
        const btn = injectButton(c, onClick);
        if (btn) render(btn);
      }
    };
    // childList only: Draft re-renders on every keystroke; modals mount in #layers under body.
    const observer = new MutationObserver(() => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(scan);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    ctx.onInvalidated(() => {
      observer.disconnect();
      removeInjected();
      browser.runtime?.onMessage.removeListener(onPush); // runtime can be gone when orphaned
    });
  },
});
