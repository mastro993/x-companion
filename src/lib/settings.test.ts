import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PROVIDERS } from './providers';
import { getStatus, settingsItem, type Settings } from './settings';

const model = PROVIDERS.openai.defaultModel;
const style = { persona: '', audience: '', voice: '', rules: '' };
const complete: Settings = {
  activeProvider: 'openai',
  providers: { openai: { apiKey: 'sk-test', model } },
  style,
  projects: [],
};

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
    expect(await settingsItem.getValue()).toEqual({ ...complete, style: { ...style, voice: 'dry, short' } });
    expect(await settingsItem.getMeta()).toEqual({ v: 3 });
  });

  it('adds an empty project list to a v2 value', async () => {
    const { projects: _, ...v2 } = { ...complete, style: { ...style, persona: 'indie dev' } };
    await fakeBrowser.storage.local.set({ settings: v2, settings$: { v: 2 } });
    await settingsItem.migrate();
    expect(await settingsItem.getValue()).toEqual({ ...v2, projects: [] });
    expect(await settingsItem.getMeta()).toEqual({ v: 3 });
  });

  it('leaves a current value stored without version meta intact', async () => {
    const v3 = {
      ...complete,
      style: { ...style, persona: 'indie dev', rules: 'no hashtags' },
      projects: [{ id: '1', name: 'Acme', description: 'notes app', link: 'https://acme.io' }],
    };
    await fakeBrowser.storage.local.set({ settings: v3 });
    await settingsItem.migrate();
    expect(await settingsItem.getValue()).toEqual(v3);
  });
});
