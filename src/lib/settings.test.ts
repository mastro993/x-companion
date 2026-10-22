import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PROVIDERS } from './providers';
import { getSettings, getStatus, saveSettings, settingsItem, type Settings, watchReady } from './settings';

const model = PROVIDERS.openai.defaultModel;
const style = { persona: '', audience: '', voice: '', rules: '' };
const complete: Settings = {
  activeProvider: 'openai',
  providers: { openai: { apiKey: 'sk-test', model } },
  style,
  projects: [],
};
// What storage holds for `complete`.
const stored = { ...complete, providers: { openai: { model } } };

describe('getStatus', () => {
  it.each<[string, Settings, ReturnType<typeof getStatus>]>([
    [
      'no provider beats every other gap',
      { ...complete, activeProvider: null, providers: {} },
      { ready: false, reason: 'no-provider', provider: null },
    ],
    [
      'active provider without saved settings',
      { ...complete, providers: { anthropic: { apiKey: 'k', model } } },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    [
      'whitespace-only key',
      { ...complete, providers: { openai: { apiKey: '  ', model } } },
      { ready: false, reason: 'no-key', provider: 'openai' },
    ],
    ['key set, style guide optional', complete, { ready: true, provider: 'openai', model }],
  ])('%s', (_, settings, expected) => {
    expect(getStatus(settings)).toEqual(expected);
  });
});

describe('settingsItem', () => {
  beforeEach(() => fakeBrowser.reset());

  it('moves the v1 free-form style into the style & vocabulary section', async () => {
    const { style: _, projects: __, ...rest } = complete;
    await fakeBrowser.storage.local.set({ settings: { ...rest, style: 'dry, short' } });
    await settingsItem.migrate();
    expect(await getSettings()).toEqual({ ...complete, style: { ...style, voice: 'dry, short' } });
    expect(await settingsItem.getMeta()).toEqual({ v: 4 });
  });

  it('adds an empty project list to a v2 value', async () => {
    const { projects: _, ...v2 } = { ...complete, style: { ...style, persona: 'indie dev' } };
    await fakeBrowser.storage.local.set({ settings: v2, settings$: { v: 2 } });
    await settingsItem.migrate();
    expect(await getSettings()).toEqual({ ...v2, projects: [] });
    expect(await settingsItem.getMeta()).toEqual({ v: 4 });
  });

  it('moves v3 keys out of the settings into their own item', async () => {
    await fakeBrowser.storage.local.set({ settings: complete, settings$: { v: 3 } });
    await settingsItem.migrate();
    expect(await fakeBrowser.storage.local.get(['settings', 'apiKeys'])).toEqual({
      settings: stored,
      apiKeys: { openai: 'sk-test' },
    });
    expect(await getSettings()).toEqual(complete);
  });

  it('leaves a current value stored without version meta intact', async () => {
    const v4 = {
      ...stored,
      style: { ...style, persona: 'indie dev', rules: 'no hashtags' },
      projects: [{ id: '1', name: 'Acme', description: 'notes app', link: 'https://acme.io' }],
    };
    const apiKeys = { openai: 'sk-test' };
    await fakeBrowser.storage.local.set({ settings: v4, apiKeys });
    await settingsItem.migrate();
    expect(await fakeBrowser.storage.local.get()).toEqual({ settings: v4, settings$: { v: 4 }, apiKeys });
    expect((await getSettings()).providers).toEqual(complete.providers);
  });
});

describe('saveSettings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('writes a style edit without rewriting the keys', async () => {
    await saveSettings(complete);
    await fakeBrowser.storage.local.remove('apiKeys'); // would come back if the keys were rewritten
    await saveSettings({ ...complete, style: { ...style, voice: 'dry' } }, complete);
    expect(await fakeBrowser.storage.local.get('apiKeys')).toEqual({});
    expect((await getSettings()).style.voice).toBe('dry');
  });
});

describe('watchReady', () => {
  beforeEach(() => fakeBrowser.reset());

  it('reports the first write after it starts, then only flips', async () => {
    await saveSettings(complete); // already ready, as when a key paste wakes the service worker
    const seen: boolean[] = [];
    const unwatch = watchReady((ready) => seen.push(ready));
    const edited = { ...complete, style: { ...style, voice: 'dry' } };
    await saveSettings(edited, complete);
    await vi.waitFor(() => expect(seen).toEqual([true]));

    const noKey = { ...edited, providers: { openai: { apiKey: '', model } } };
    await saveSettings(noKey, edited);
    await saveSettings({ ...noKey, style }, noKey); // still not ready: no report
    await vi.waitFor(() => expect(seen).toEqual([true, false]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([true, false]);
    unwatch();
  });
});
