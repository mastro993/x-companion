import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isXUrl, parseRequest } from '@/lib/background-utils';
import { generateText } from '@/lib/llm';
import type {
  ContentPush,
  GenerateReplyResponse,
  StatusResponse,
  TargetPost,
} from '@/lib/messages';
import { buildReplyPrompt, cleanReply } from '@/lib/prompt';
import { getStatus, settingsItem } from '@/lib/settings';

// Tab-specific panel only (the manifest has no side_panel). setOptions is idempotent:
// it doesn't reload an open panel, so syncing on every tab update is fine.
function syncTab(tabId: number, url: string | undefined): void {
  const onX = isXUrl(url);
  Promise.all([
    browser.sidePanel.setOptions(
      onX ? { tabId, path: 'sidepanel.html', enabled: true } : { tabId, enabled: false },
    ),
    onX ? browser.action.enable(tabId) : browser.action.disable(tabId),
  ]).catch(() => {}); // the tab can close mid-sync
}

// Per-tab panel options and action state live in memory: lost on browser restart, extension
// reload/update and disable/enable.
async function syncAllTabs(): Promise<void> {
  for (const tab of await browser.tabs.query({})) {
    if (tab.id !== undefined) syncTab(tab.id, tab.url);
  }
}

async function pushStatus(ready: boolean): Promise<void> {
  const push: ContentPush = { type: 'status', ready };
  for (const tab of await browser.tabs.query({ url: 'https://x.com/*' })) {
    // Tabs without a live content script reject with "Receiving end does not exist".
    if (tab.id !== undefined) browser.tabs.sendMessage(tab.id, push).catch(() => {});
  }
}

async function generateReply(post: TargetPost): Promise<string> {
  const settings = await settingsItem.getValue();
  const status = getStatus(settings);
  if (!status.ready) throw new Error('Finish setup in the x-companion side panel');
  const apiKey = settings.providers[status.provider]?.apiKey.trim() ?? '';
  // An outgoing fetch alone doesn't count as service-worker activity.
  const keepalive = setInterval(() => void browser.runtime.getPlatformInfo(), 25_000);
  try {
    const text = cleanReply(
      await generateText(
        { provider: status.provider, apiKey, model: status.model },
        buildReplyPrompt(post, settings.style),
      ),
    );
    if (!text) throw new Error('The model returned an empty reply. Try again.');
    return text;
  } finally {
    clearInterval(keepalive);
  }
}

export default defineBackground(() => {
  // Keeps API keys in storage.local away from content scripts. Persists, but is cheap to repeat.
  browser.storage.local
    .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch((e) => console.error('setAccessLevel failed', e));
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('setPanelBehavior failed', e));

  browser.tabs.onUpdated.addListener((tabId, _info, tab) => syncTab(tabId, tab.url));
  // Every worker start: covers install, update, enable and browser start. Idempotent.
  void syncAllTabs();

  settingsItem.watch((next, prev) => {
    const ready = getStatus(next).ready;
    if (ready !== getStatus(prev).ready) void pushStatus(ready);
  });

  // One non-async listener with `return true` + sendResponse: Promise returns need Chrome 148+,
  // and an async listener would answer every message (with null) before we do.
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (sender.origin !== 'https://x.com' || tabId === undefined) return;
    const req = parseRequest(message);
    if (!req) return;

    switch (req.type) {
      case 'open-side-panel':
        // Must run before any await to keep the click's user gesture.
        browser.sidePanel.open({ tabId }).catch((e) => console.error('sidePanel.open failed', e));
        sendResponse();
        return;
      case 'get-status':
        settingsItem.getValue().then(
          (s) => sendResponse({ ready: getStatus(s).ready } satisfies StatusResponse),
          () => sendResponse({ ready: false } satisfies StatusResponse),
        );
        return true;
      case 'generate-reply':
        generateReply(req.post).then(
          (text) => sendResponse({ ok: true, text } satisfies GenerateReplyResponse),
          (e: unknown) =>
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            } satisfies GenerateReplyResponse),
        );
        return true;
    }
  });
});
